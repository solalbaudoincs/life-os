import { useRef, useCallback, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useChatStore } from "../stores/chatStore";
import { useModuleStore } from "../stores/moduleStore";
import { useNoteStore } from "../stores/noteStore";
import { sendVoice } from "../api/voice";
import { toast } from "sonner";

type VoiceState = "idle" | "recording" | "processing";

export function useVoice() {
  const voiceActive = useUIStore((s) => s.voiceActive);
  const setVoiceState = useUIStore((s) => s.setVoiceState);
  const voiceState = useUIStore((s) => s.voiceState);
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  const chatStore = useChatStore();
  const fetchModules = useModuleStore((s) => s.fetch);
  const activeModuleId = useModuleStore((s) => s.activeModuleId);
  const fetchForModule = useNoteStore((s) => s.fetchForModule);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        if (blob.size < 1000) {
          setVoiceState("idle");
          toast.error("Recording too short");
          return;
        }

        setVoiceState("processing");

        try {
          const result = await sendVoice(blob, chatStore.conversationId);

          // Show the transcript and response in chat
          setChatOpen(true);
          chatStore.messages.push(
            { role: "user", content: `[Voice] ${result.transcript}` },
            {
              role: "assistant",
              content: result.response,
              tool_calls: result.tool_calls,
            }
          );
          // Trigger re-render via zustand
          useChatStore.setState({
            messages: [...chatStore.messages],
            conversationId: result.conversation_id ?? chatStore.conversationId,
          });

          // Refresh data
          fetchModules();
          if (activeModuleId) fetchForModule(activeModuleId);

          toast.success("Voice processed");
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Voice processing failed"
          );
        } finally {
          setVoiceState("idle");
        }
      };

      recorder.start();
      setVoiceState("recording");
    } catch (err) {
      toast.error("Microphone access denied");
      setVoiceState("idle");
      useUIStore.setState({ voiceActive: false });
    }
  }, [chatStore, setChatOpen, setVoiceState, fetchModules, activeModuleId, fetchForModule]);

  // React to voiceActive toggle
  useEffect(() => {
    if (voiceActive && voiceState === "idle") {
      startRecording();
    } else if (!voiceActive && voiceState === "recording") {
      stopRecording();
    }
  }, [voiceActive, voiceState, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  return { voiceState };
}
