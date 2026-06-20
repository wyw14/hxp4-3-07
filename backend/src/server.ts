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

function isValidFiniteNumber(value: any): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

function validateLevelStructure(level: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (level === null || level === undefined) {
    return { valid: false, errors: ['<root> 不能是 null 或 undefined'] };
  }
  if (Array.isArray(level)) {
    return { valid: false, errors: ['<root> 不能是数组，必须是对象'] };
  }
  if (typeof level !== 'object') {
    return { valid: false, errors: [`<root> 必须是对象，当前类型: ${typeof level}`] };
  }

  if (!isValidFiniteNumber(level.id)) {
    errors.push(`id 必须是有限数字，当前值: ${JSON.stringify(level.id)}`);
  }
  if (typeof level.name !== 'string') {
    errors.push(`name 必须是字符串，当前类型: ${typeof level.name}`);
  } else if (level.name.trim() === '') {
    errors.push('name 不能是空字符串');
  }
  if (typeof level.creatureName !== 'string') {
    errors.push(`creatureName 必须是字符串，当前类型: ${typeof level.creatureName}`);
  } else if (level.creatureName.trim() === '') {
    errors.push('creatureName 不能是空字符串');
  }
  if (typeof level.creatureDescription !== 'string') {
    errors.push(`creatureDescription 必须是字符串，当前类型: ${typeof level.creatureDescription}`);
  }
  if (!isValidFiniteNumber(level.rotationSpeed)) {
    errors.push(`rotationSpeed 必须是有限数字，当前值: ${JSON.stringify(level.rotationSpeed)}`);
  }

  if (!Array.isArray(level.anchorPoints)) {
    errors.push(`anchorPoints 必须是数组，当前类型: ${level.anchorPoints === null ? 'null' : typeof level.anchorPoints}`);
  } else if (level.anchorPoints.length === 0) {
    errors.push('anchorPoints 不能为空数组');
  } else {
    const anchorIds = new Set<string>();
    level.anchorPoints.forEach((p: any, i: number) => {
      const prefix = `anchorPoints[${i}]`;
      if (p === null || p === undefined) {
        errors.push(`${prefix} 不能是 null 或 undefined`);
        return;
      }
      if (typeof p !== 'object' || Array.isArray(p)) {
        errors.push(`${prefix} 必须是对象`);
        return;
      }

      if (typeof p.id !== 'string') {
        errors.push(`${prefix}.id 必须是字符串，当前类型: ${typeof p.id}`);
      } else if (p.id.trim() === '') {
        errors.push(`${prefix}.id 不能是空字符串`);
      } else {
        if (anchorIds.has(p.id)) {
          errors.push(`${prefix}.id 重复: ${p.id}`);
        }
        anchorIds.add(p.id);
      }

      if (!isValidFiniteNumber(p.x)) {
        errors.push(`${prefix}.x 必须是 0-1 之间的有限数字，当前值: ${JSON.stringify(p.x)}`);
      } else if (p.x < 0 || p.x > 1) {
        errors.push(`${prefix}.x 必须在 0-1 范围内，当前值: ${p.x}`);
      }

      if (!isValidFiniteNumber(p.y)) {
        errors.push(`${prefix}.y 必须是 0-1 之间的有限数字，当前值: ${JSON.stringify(p.y)}`);
      } else if (p.y < 0 || p.y > 1) {
        errors.push(`${prefix}.y 必须在 0-1 范围内，当前值: ${p.y}`);
      }

      if (!isValidFiniteNumber(p.frequency)) {
        errors.push(`${prefix}.frequency 必须是正的有限数字，当前值: ${JSON.stringify(p.frequency)}`);
      } else if (p.frequency <= 0) {
        errors.push(`${prefix}.frequency 必须大于 0，当前值: ${p.frequency}`);
      }

      if (p.name !== undefined && typeof p.name !== 'string') {
        errors.push(`${prefix}.name 必须是字符串，当前类型: ${typeof p.name}`);
      }
      if (p.baseBrightness !== undefined && !isValidFiniteNumber(p.baseBrightness)) {
        errors.push(`${prefix}.baseBrightness 必须是有限数字，当前值: ${JSON.stringify(p.baseBrightness)}`);
      }
      if (p.size !== undefined && !isValidFiniteNumber(p.size)) {
        errors.push(`${prefix}.size 必须是有限数字，当前值: ${JSON.stringify(p.size)}`);
      }
    });
  }

  if (!Array.isArray(level.edges)) {
    errors.push(`edges 必须是数组，当前类型: ${level.edges === null ? 'null' : typeof level.edges}`);
  } else if (level.edges.length === 0) {
    errors.push('edges 不能为空数组');
  } else {
    const anchorIds = new Set<string>();
    if (Array.isArray(level.anchorPoints)) {
      level.anchorPoints.forEach((p: any) => {
        if (p && typeof p.id === 'string') anchorIds.add(p.id);
      });
    }

    const edgeKeys = new Set<string>();
    level.edges.forEach((e: any, i: number) => {
      const prefix = `edges[${i}]`;
      if (e === null || e === undefined) {
        errors.push(`${prefix} 不能是 null 或 undefined`);
        return;
      }
      if (typeof e !== 'object' || Array.isArray(e)) {
        errors.push(`${prefix} 必须是对象`);
        return;
      }

      if (typeof e.from !== 'string') {
        errors.push(`${prefix}.from 必须是字符串，当前类型: ${typeof e.from}`);
      } else if (e.from.trim() === '') {
        errors.push(`${prefix}.from 不能是空字符串`);
      } else if (!anchorIds.has(e.from)) {
        errors.push(`${prefix}.from 引用了不存在的锚点 ID: ${e.from}`);
      }

      if (typeof e.to !== 'string') {
        errors.push(`${prefix}.to 必须是字符串，当前类型: ${typeof e.to}`);
      } else if (e.to.trim() === '') {
        errors.push(`${prefix}.to 不能是空字符串`);
      } else if (!anchorIds.has(e.to)) {
        errors.push(`${prefix}.to 引用了不存在的锚点 ID: ${e.to}`);
      }

      if (typeof e.from === 'string' && typeof e.to === 'string' && e.from === e.to && e.from !== '') {
        errors.push(`${prefix} 不能自连接: ${e.from}`);
      }

      if (!Array.isArray(e.frequencyRatio)) {
        errors.push(`${prefix}.frequencyRatio 必须是包含两个正整数的数组，当前类型: ${e.frequencyRatio === null ? 'null' : typeof e.frequencyRatio}`);
      } else if (e.frequencyRatio.length !== 2) {
        errors.push(`${prefix}.frequencyRatio 必须包含且仅包含两个元素，当前长度: ${e.frequencyRatio.length}`);
      } else {
        const r0 = e.frequencyRatio[0];
        const r1 = e.frequencyRatio[1];

        if (!isValidFiniteNumber(r0)) {
          errors.push(`${prefix}.frequencyRatio[0] 必须是正的有限数字，当前值: ${JSON.stringify(r0)}`);
        } else if (!Number.isInteger(r0)) {
          errors.push(`${prefix}.frequencyRatio[0] 必须是整数，当前值: ${r0}`);
        } else if (r0 <= 0) {
          errors.push(`${prefix}.frequencyRatio[0] 必须大于 0，当前值: ${r0}`);
        } else if (r0 > 10) {
          errors.push(`${prefix}.frequencyRatio[0] 不能超过 10，当前值: ${r0}`);
        }

        if (!isValidFiniteNumber(r1)) {
          errors.push(`${prefix}.frequencyRatio[1] 必须是正的有限数字，当前值: ${JSON.stringify(r1)}`);
        } else if (!Number.isInteger(r1)) {
          errors.push(`${prefix}.frequencyRatio[1] 必须是整数，当前值: ${r1}`);
        } else if (r1 <= 0) {
          errors.push(`${prefix}.frequencyRatio[1] 必须大于 0，当前值: ${r1}`);
        } else if (r1 > 10) {
          errors.push(`${prefix}.frequencyRatio[1] 不能超过 10，当前值: ${r1}`);
        }
      }

      if (typeof e.from === 'string' && typeof e.to === 'string' && e.from !== '' && e.to !== '' && e.from !== e.to) {
        const key = [e.from, e.to].sort().join('-');
        if (edgeKeys.has(key)) {
          errors.push(`${prefix} 重复的边定义: ${e.from}-${e.to}`);
        }
        edgeKeys.add(key);
      }
    });
  }

  if (level.lightPollution === null || level.lightPollution === undefined) {
    errors.push('lightPollution 不能是 null 或 undefined');
  } else if (Array.isArray(level.lightPollution)) {
    errors.push('lightPollution 不能是数组，必须是对象');
  } else if (typeof level.lightPollution !== 'object') {
    errors.push(`lightPollution 必须是对象，当前类型: ${typeof level.lightPollution}`);
  } else {
    if (!isValidFiniteNumber(level.lightPollution.baseIntensity)) {
      errors.push(`lightPollution.baseIntensity 必须是有限数字，当前值: ${JSON.stringify(level.lightPollution.baseIntensity)}`);
    }
    if (!isValidFiniteNumber(level.lightPollution.variability)) {
      errors.push(`lightPollution.variability 必须是有限数字，当前值: ${JSON.stringify(level.lightPollution.variability)}`);
    }
    if (!isValidFiniteNumber(level.lightPollution.speed)) {
      errors.push(`lightPollution.speed 必须是有限数字，当前值: ${JSON.stringify(level.lightPollution.speed)}`);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateStarPulses(level: any): { valid: boolean; errors: string[]; harmonicEdges: number; totalEdges: number } {
  const errors: string[] = [];
  let harmonicEdges = 0;
  const totalEdges = Array.isArray(level?.edges) ? level.edges.length : 0;

  if (!Array.isArray(level?.anchorPoints) || !Array.isArray(level?.edges)) {
    return { valid: false, errors: ['缺少锚点或边数据'], harmonicEdges: 0, totalEdges: 0 };
  }

  const freqMap = new Map<string, number>();
  level.anchorPoints.forEach((p: any) => {
    if (p && typeof p.id === 'string' && isValidFiniteNumber(p.frequency)) {
      freqMap.set(p.id, p.frequency);
    }
  });

  level.edges.forEach((e: any, i: number) => {
    const prefix = `edges[${i}]`;
    if (!e || typeof e !== 'object') return;

    const fromId = typeof e.from === 'string' ? e.from : '';
    const toId = typeof e.to === 'string' ? e.to : '';

    const f1 = freqMap.get(fromId);
    const f2 = freqMap.get(toId);

    if (f1 === undefined || f2 === undefined) {
      errors.push(`${prefix} 引用的锚点频率数据缺失: ${fromId || e.from} - ${toId || e.to}`);
      return;
    }

    if (!isValidFiniteNumber(f1) || !isValidFiniteNumber(f2)) {
      errors.push(`${prefix} 引用的锚点频率无效: ${fromId}=${f1}, ${toId}=${f2}`);
      return;
    }

    const minF = Math.min(f1, f2);
    if (minF <= 0) {
      errors.push(`${prefix} 引用的锚点频率必须大于 0`);
      return;
    }

    const isHarmonic = isSimpleFrequencyRatio(f1, f2);
    if (isHarmonic) {
      harmonicEdges++;
    } else {
      errors.push(`${prefix} (${fromId}-${toId}) 频率不成谐波比例: ${f1}Hz / ${f2}Hz`);
    }

    if (Array.isArray(e.frequencyRatio) && e.frequencyRatio.length === 2) {
      const ratio1 = e.frequencyRatio[0];
      const ratio2 = e.frequencyRatio[1];

      if (isValidFiniteNumber(ratio1) && isValidFiniteNumber(ratio2) && ratio1 > 0 && ratio2 > 0) {
        const maxF = Math.max(f1, f2);
        const minF = Math.min(f1, f2);
        const expectedMax = Math.max(ratio1, ratio2);
        const expectedMin = Math.min(ratio1, ratio2);
        const actualRatio = maxF / minF;
        const expectedRatio = expectedMax / expectedMin;

        if (isValidFiniteNumber(actualRatio) && isValidFiniteNumber(expectedRatio) && expectedRatio > 0) {
          if (Math.abs(actualRatio - expectedRatio) > 0.05) {
            errors.push(`${prefix} (${fromId}-${toId}) frequencyRatio 与实际频率不匹配: 期望 ${expectedMin}:${expectedMax}, 实际约 ${minF.toFixed(2)}:${maxF.toFixed(2)}`);
          }
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
