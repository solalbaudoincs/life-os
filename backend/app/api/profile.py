from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.user_profile import UserProfile

router = APIRouter(prefix="/api/profile", tags=["profile"])


async def _get_or_create(db: AsyncSession) -> UserProfile:
    result = await db.execute(select(UserProfile).limit(1))
    profile = result.scalar_one_or_none()
    if not profile:
        profile = UserProfile(data={})
        db.add(profile)
        await db.commit()
        await db.refresh(profile)
    return profile


@router.get("")
async def get_profile(db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create(db)
    return {"id": str(profile.id), "data": profile.data}


@router.put("")
async def update_profile(body: dict, db: AsyncSession = Depends(get_db)):
    profile = await _get_or_create(db)
    profile.data = {**profile.data, **body}
    await db.commit()
    await db.refresh(profile)
    return {"id": str(profile.id), "data": profile.data}
