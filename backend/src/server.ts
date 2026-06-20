import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import type { LevelsData, LevelData } from './types';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3003;

app.use(cors());
app.use(express.json());

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');

function loadLevels(): LevelsData {
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf-8');
    return JSON.parse(raw) as LevelsData;
  } catch (err) {
    console.error('Failed to load levels:', err);
    return { levels: [] };
  }
}

function saveLevels(data: LevelsData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save levels:', err);
    return false;
  }
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0.0001) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function isSimpleFrequencyRatio(f1: number, f2: number, maxDenom: number = 10): boolean {
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  if (minF < 0.0001) return false;

  const ratio = maxF / minF;

  for (let denom = 1; denom <= maxDenom; denom++) {
    const numer = ratio * denom;
    const rounded = Math.round(numer);
    if (Math.abs(numer - rounded) < 0.02 && rounded <= maxDenom && rounded > 0) {
      return true;
    }
  }

  return false;
}

app.get('/api/levels', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    total: data.levels.length,
    levels: data.levels.map((l: LevelData) => ({
      id: l.id,
      name: l.name,
      creatureName: l.creatureName
    }))
  });
});

app.get('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  res.json({
    success: true,
    level
  });
});

app.get('/api/levels/:id/verify', (req, res) => {
  const id = parseInt(req.params.id);
  const edgeParam = req.query.edge as string;

  if (!edgeParam) {
    res.status(400).json({
      success: false,
      error: 'Missing edge parameter'
    });
    return;
  }

  const [from, to] = edgeParam.split('-');
  if (!from || !to) {
    res.status(400).json({
      success: false,
      error: 'Invalid edge format, expected from-to'
    });
    return;
  }

  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  const fromPoint = level.anchorPoints.find(p => p.id === from);
  const toPoint = level.anchorPoints.find(p => p.id === to);

  if (!fromPoint || !toPoint) {
    res.json({
      success: true,
      valid: false,
      reason: 'Unknown anchor point'
    });
    return;
  }

  const isDefinedEdge = level.edges.some(
    e => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );

  const f1 = fromPoint.frequency;
  const f2 = toPoint.frequency;
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  const isHarmonic = isSimpleFrequencyRatio(f1, f2);

  res.json({
    success: true,
    valid: isDefinedEdge && isHarmonic,
    isHarmonic,
    isDefinedEdge,
    frequencies: {
      [from]: f1,
      [to]: f2
    },
    ratio: isHarmonic ? [minF, maxF] : null
  });
});

function validateLevelStructure(level: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!level || typeof level !== 'object') {
    return { valid: false, errors: ['关卡数据必须是对象'] };
  }

  if (typeof level.id !== 'number') {
    errors.push('id 必须是数字');
  }
  if (typeof level.name !== 'string' || level.name.trim() === '') {
    errors.push('name 必须是非空字符串');
  }
  if (typeof level.creatureName !== 'string' || level.creatureName.trim() === '') {
    errors.push('creatureName 必须是非空字符串');
  }
  if (typeof level.creatureDescription !== 'string') {
    errors.push('creatureDescription 必须是字符串');
  }
  if (typeof level.rotationSpeed !== 'number') {
    errors.push('rotationSpeed 必须是数字');
  }

  if (!Array.isArray(level.anchorPoints)) {
    errors.push('anchorPoints 必须是数组');
  } else if (level.anchorPoints.length === 0) {
    errors.push('anchorPoints 不能为空');
  } else {
    const anchorIds = new Set<string>();
    level.anchorPoints.forEach((p: any, i: number) => {
      if (typeof p.id !== 'string' || p.id.trim() === '') {
        errors.push(`anchorPoints[${i}].id 必须是非空字符串`);
      } else {
        if (anchorIds.has(p.id)) {
          errors.push(`anchorPoints[${i}].id 重复: ${p.id}`);
        }
        anchorIds.add(p.id);
      }
      if (typeof p.x !== 'number' || p.x < 0 || p.x > 1) {
        errors.push(`anchorPoints[${i}].x 必须是 0-1 之间的数字`);
      }
      if (typeof p.y !== 'number' || p.y < 0 || p.y > 1) {
        errors.push(`anchorPoints[${i}].y 必须是 0-1 之间的数字`);
      }
      if (typeof p.frequency !== 'number' || p.frequency <= 0) {
        errors.push(`anchorPoints[${i}].frequency 必须是正数`);
      }
      if (p.name !== undefined && typeof p.name !== 'string') {
        errors.push(`anchorPoints[${i}].name 必须是字符串`);
      }
      if (p.baseBrightness !== undefined && typeof p.baseBrightness !== 'number') {
        errors.push(`anchorPoints[${i}].baseBrightness 必须是数字`);
      }
      if (p.size !== undefined && typeof p.size !== 'number') {
        errors.push(`anchorPoints[${i}].size 必须是数字`);
      }
    });
  }

  if (!Array.isArray(level.edges)) {
    errors.push('edges 必须是数组');
  } else if (level.edges.length === 0) {
    errors.push('edges 不能为空');
  } else {
    const anchorIds = new Set<string>();
    if (Array.isArray(level.anchorPoints)) {
      level.anchorPoints.forEach((p: any) => anchorIds.add(p.id));
    }

    const edgeKeys = new Set<string>();
    level.edges.forEach((e: any, i: number) => {
      if (typeof e.from !== 'string' || e.from.trim() === '') {
        errors.push(`edges[${i}].from 必须是非空字符串`);
      } else if (!anchorIds.has(e.from)) {
        errors.push(`edges[${i}].from 引用了不存在的锚点: ${e.from}`);
      }
      if (typeof e.to !== 'string' || e.to.trim() === '') {
        errors.push(`edges[${i}].to 必须是非空字符串`);
      } else if (!anchorIds.has(e.to)) {
        errors.push(`edges[${i}].to 引用了不存在的锚点: ${e.to}`);
      }
      if (e.from === e.to && e.from && e.to) {
        errors.push(`edges[${i}] 不能自连接: ${e.from}`);
      }
      if (!Array.isArray(e.frequencyRatio) || e.frequencyRatio.length !== 2) {
        errors.push(`edges[${i}].frequencyRatio 必须是包含两个数字的数组`);
      } else {
        if (typeof e.frequencyRatio[0] !== 'number' || e.frequencyRatio[0] <= 0) {
          errors.push(`edges[${i}].frequencyRatio[0] 必须是正数`);
        }
        if (typeof e.frequencyRatio[1] !== 'number' || e.frequencyRatio[1] <= 0) {
          errors.push(`edges[${i}].frequencyRatio[1] 必须是正数`);
        }
      }

      if (e.from && e.to && e.from !== e.to) {
        const key = [e.from, e.to].sort().join('-');
        if (edgeKeys.has(key)) {
          errors.push(`edges[${i}] 重复边: ${e.from}-${e.to}`);
        }
        edgeKeys.add(key);
      }
    });
  }

  if (!level.lightPollution || typeof level.lightPollution !== 'object') {
    errors.push('lightPollution 必须是对象');
  } else {
    if (typeof level.lightPollution.baseIntensity !== 'number') {
      errors.push('lightPollution.baseIntensity 必须是数字');
    }
    if (typeof level.lightPollution.variability !== 'number') {
      errors.push('lightPollution.variability 必须是数字');
    }
    if (typeof level.lightPollution.speed !== 'number') {
      errors.push('lightPollution.speed 必须是数字');
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateStarPulses(level: any): { valid: boolean; errors: string[]; harmonicEdges: number; totalEdges: number } {
  const errors: string[] = [];
  let harmonicEdges = 0;
  const totalEdges = level.edges?.length || 0;

  if (!Array.isArray(level.anchorPoints) || !Array.isArray(level.edges)) {
    return { valid: false, errors: ['缺少锚点或边数据'], harmonicEdges: 0, totalEdges: 0 };
  }

  const freqMap = new Map<string, number>();
  level.anchorPoints.forEach((p: any) => {
    freqMap.set(p.id, p.frequency);
  });

  level.edges.forEach((e: any, i: number) => {
    const f1 = freqMap.get(e.from);
    const f2 = freqMap.get(e.to);

    if (f1 !== undefined && f2 !== undefined) {
      const isHarmonic = isSimpleFrequencyRatio(f1, f2);
      if (isHarmonic) {
        harmonicEdges++;
      } else {
        errors.push(`edges[${i}] (${e.from}-${e.to}) 频率不成谐波比例: ${f1}Hz / ${f2}Hz`);
      }

      if (Array.isArray(e.frequencyRatio) && e.frequencyRatio.length === 2) {
        const ratio1 = e.frequencyRatio[0];
        const ratio2 = e.frequencyRatio[1];
        const maxF = Math.max(f1, f2);
        const minF = Math.min(f1, f2);
        const expectedMax = Math.max(ratio1, ratio2);
        const expectedMin = Math.min(ratio1, ratio2);
        const actualRatio = maxF / minF;
        const expectedRatio = expectedMax / expectedMin;

        if (Math.abs(actualRatio - expectedRatio) > 0.05) {
          errors.push(`edges[${i}] (${e.from}-${e.to}) frequencyRatio 与实际频率不匹配: 期望 ${expectedMin}:${expectedMax}, 实际约 ${minF.toFixed(2)}:${maxF.toFixed(2)}`);
        }
      }
    }
  });

  return { valid: errors.length === 0, errors, harmonicEdges, totalEdges };
}

app.post('/api/levels/validate', (req, res) => {
  const levelData = req.body;

  const structureCheck = validateLevelStructure(levelData);
  if (!structureCheck.valid) {
    res.json({
      success: true,
      valid: false,
      reason: 'structure',
      errors: structureCheck.errors
    });
    return;
  }

  const starPulseCheck = validateStarPulses(levelData);
  if (!starPulseCheck.valid) {
    res.json({
      success: true,
      valid: false,
      reason: 'starPulse',
      errors: starPulseCheck.errors,
      harmonicEdges: starPulseCheck.harmonicEdges,
      totalEdges: starPulseCheck.totalEdges
    });
    return;
  }

  res.json({
    success: true,
    valid: true,
    level: levelData as LevelData,
    harmonicEdges: starPulseCheck.harmonicEdges,
    totalEdges: starPulseCheck.totalEdges
  });
});

app.post('/api/levels', (req, res) => {
  const newLevel = req.body as LevelData;

  const structureCheck = validateLevelStructure(newLevel);
  if (!structureCheck.valid) {
    res.status(400).json({
      success: false,
      error: 'Invalid level data',
      errors: structureCheck.errors
    });
    return;
  }

  const data = loadLevels();
  const existing = data.levels.findIndex(l => l.id === newLevel.id);

  if (existing >= 0) {
    data.levels[existing] = newLevel;
  } else {
    data.levels.push(newLevel);
  }

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: newLevel
    });
  } else {
    res.status(500).json({
      success: false,
      error: 'Failed to save level'
    });
  }
});

app.get('/api/health', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    status: 'running',
    port: PORT,
    levelsLoaded: data.levels.length
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✨ 星座游戏服务器启动成功`);
  console.log(`📡 服务地址: http://localhost:${PORT}`);
  console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
  console.log(`🎮 关卡数量: ${loadLevels().levels.length}\n`);
});
