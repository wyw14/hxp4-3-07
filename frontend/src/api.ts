import type { LevelData, VerifyResult } from './types';

const API_BASE = '/api';

export async function getLevelList(): Promise<{ id: number; name: string; creatureName: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/levels`);
    const data = await res.json();
    if (data.success) {
      return data.levels;
    }
    return [];
  } catch {
    return [];
  }
}

export async function getLevel(id: number): Promise<LevelData | null> {
  try {
    const res = await fetch(`${API_BASE}/levels/${id}`);
    const data = await res.json();
    if (data.success) {
      return data.level as LevelData;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyEdge(levelId: number, from: string, to: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/levels/${levelId}/verify?edge=${from}-${to}`);
    return await res.json() as VerifyResult;
  } catch {
    return {
      success: false,
      valid: false,
      isHarmonic: false,
      isDefinedEdge: false
    };
  }
}

export async function validateTempLevel(levelData: any): Promise<{
  success: boolean;
  valid: boolean;
  reason?: string;
  errors?: string[];
  level?: LevelData;
  harmonicEdges?: number;
  totalEdges?: number;
}> {
  try {
    const res = await fetch(`${API_BASE}/levels/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(levelData)
    });
    return await res.json();
  } catch {
    return {
      success: false,
      valid: false,
      errors: ['无法连接到服务器，请检查后端是否启动']
    };
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return data.success && data.status === 'running';
  } catch {
    return false;
  }
}
