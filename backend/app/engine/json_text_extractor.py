"""Incremental extractor for the 'text' field from streaming structured JSON output.

When Mistral streams a structured response like {"text": "Hello...", "suggested_followups": [...]},
this class extracts only the human-readable text content token by token, handling JSON string escapes.
"""

from __future__ import annotations

import json


class JSONTextExtractor:
    """Incrementally extract the 'text' field value from streaming JSON."""

    def __init__(self) -> None:
        self._buffer = ""
        self._text_value_start = -1  # index after the opening quote of "text" value
        self._emitted = 0  # chars already yielded from decoded text
        self._finished = False  # True once closing quote is found
        self._escape = False  # inside a backslash escape

    def feed(self, token: str) -> str:
        """Feed a new chunk. Returns any new decoded text characters to stream."""
        if self._finished:
            self._buffer += token
            return ""

        self._buffer += token

        # Locate the start of the "text" field value if not found yet
        if self._text_value_start < 0:
            idx = self._buffer.find('"text"')
            if idx < 0:
                return ""
            rest = self._buffer[idx + 6:]  # after "text"
            colon = rest.find(":")
            if colon < 0:
                return ""
            after_colon = rest[colon + 1:].lstrip()
            if not after_colon or after_colon[0] != '"':
                return ""
            # Calculate the absolute index right after the opening quote
            chars_before_quote = len(rest[colon + 1:]) - len(after_colon)
            self._text_value_start = idx + 6 + colon + 1 + chars_before_quote + 1
            self._emitted = 0

        # Decode characters from the text value
        raw = self._buffer[self._text_value_start:]
        decoded = self._decode_json_string(raw)
        new_chars = decoded[self._emitted:]
        self._emitted = len(decoded)
        return new_chars

    def get_full_json(self) -> dict | None:
        """After streaming completes, parse the full accumulated JSON buffer."""
        try:
            return json.loads(self._buffer)
        except (json.JSONDecodeError, ValueError):
            return None

    def get_raw_buffer(self) -> str:
        """Return the raw accumulated buffer (for fallback parsing)."""
        return self._buffer

    def _decode_json_string(self, s: str) -> str:
        """Decode a partial JSON string value (content after the opening quote).

        Handles standard JSON escape sequences. Stops at the unescaped closing
        quote or end of buffer. Sets self._finished when the closing quote is found.
        """
        result: list[str] = []
        i = 0
        while i < len(s):
            c = s[i]

            if self._escape:
                self._escape = False
                if c == '"':
                    result.append('"')
                elif c == "\\":
                    result.append("\\")
                elif c == "/":
                    result.append("/")
                elif c == "n":
                    result.append("\n")
                elif c == "r":
                    result.append("\r")
                elif c == "t":
                    result.append("\t")
                elif c == "b":
                    result.append("\b")
                elif c == "f":
                    result.append("\f")
                elif c == "u":
                    # Unicode escape \uXXXX
                    if i + 4 <= len(s):
                        hex_str = s[i + 1 : i + 5]
                        try:
                            result.append(chr(int(hex_str, 16)))
                            i += 5
                            continue
                        except ValueError:
                            # Incomplete/invalid hex — stop here, wait for more data
                            self._escape = True  # re-enter escape state
                            i -= 1  # back up to retry
                            break
                    else:
                        # Not enough chars yet, wait for more data
                        self._escape = True
                        i -= 1
                        break
                else:
                    result.append(c)
                i += 1
                continue

            if c == "\\":
                self._escape = True
                i += 1
                continue

            if c == '"':
                # Unescaped closing quote — end of text field
                self._finished = True
                break

            result.append(c)
            i += 1

        return "".join(result)
