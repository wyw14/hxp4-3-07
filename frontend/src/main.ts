import { Game } from './game';
import type { LevelData } from './types';
import { healthCheck, validateTempLevel } from './api';

const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
const game = new Game(canvas);

const levelNumEl = document.getElementById('level-num')!;
const creatureNameEl = document.getElementById('creature-name')!;
const connectedCountEl = document.getElementById('connected-count')!;
const totalCountEl = document.getElementById('total-count')!;
const progressFillEl = document.getElementById('progress-fill')!;
const hintTitleEl = document.getElementById('hint-title')!;
const hintTextEl = document.getElementById('hint-text')!;
const completeModal = document.getElementById('complete-modal')!;
const modalTitleEl = document.getElementById('modal-title')!;
const modalDescEl = document.getElementById('modal-desc')!;

const btnUndo = document.getElementById('btn-undo') as HTMLButtonElement;
const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
const btnHint = document.getElementById('btn-hint') as HTMLButtonElement;
const btnNext = document.getElementById('btn-next') as HTMLButtonElement;

const btnImport = document.getElementById('btn-import') as HTMLButtonElement;
const importModal = document.getElementById('import-modal')!;
const importTextarea = document.getElementById('import-textarea') as HTMLTextAreaElement;
const importErrors = document.getElementById('import-errors')!;
const importErrorsList = importErrors.querySelector('ul')!;
const importStatus = document.getElementById('import-status')!;
const btnImportCancel = document.getElementById('btn-import-cancel') as HTMLButtonElement;
const btnImportValidate = document.getElementById('btn-import-validate') as HTMLButtonElement;

const MAX_LEVELS = 3;

game.setCallbacks({
  onLevelChange: (level: LevelData) => {
    const isTemp = game.getIsTempLevel();
    levelNumEl.innerHTML = isTemp
      ? `${level.id} <span class="temp-badge">临时</span>`
      : String(level.id);
    creatureNameEl.textContent = level.creatureName;
    totalCountEl.textContent = String(level.edges.length);
    connectedCountEl.textContent = '0';
    progressFillEl.style.width = '0%';
    completeModal.classList.remove('show');

    hintTitleEl.textContent = isTemp
      ? `临时关卡: ${level.name}`
      : `关卡 ${level.id}: ${level.name}`;
    hintTextEl.textContent = '寻找闪烁频率成倍数关系的恒星，从一颗星拖动到另一颗星连接它们';
  },
  onProgressChange: (current: number, total: number) => {
    connectedCountEl.textContent = String(current);
    const pct = total > 0 ? (current / total) * 100 : 0;
    progressFillEl.style.width = `${pct}%`;

    if (current < total) {
      if (current === 0) {
        hintTitleEl.textContent = '观察星空';
        hintTextEl.textContent = '仔细观察星星的闪烁节奏，找到频率相同或成倍数的恒星';
      } else if (current < total * 0.3) {
        hintTitleEl.textContent = '初见端倪';
        hintTextEl.textContent = '做得好！继续寻找，你会发现恒星间的谐波共振关系';
      } else if (current < total * 0.6) {
        hintTitleEl.textContent = '星脉初现';
        hintTextEl.textContent = '神话生物的轮廓正在浮现，耐心连接剩余的星脉';
      } else if (current < total) {
        hintTitleEl.textContent = '即将完成';
        hintTextEl.textContent = '只剩最后几颗星了！神话生物即将显现';
      }
    }
  },
  onComplete: (desc: string) => {
    hintTitleEl.textContent = '✨ 星座完成 ✨';
    hintTextEl.textContent = '星界神话生物已显现！仔细欣赏它的光辉吧';

    modalTitleEl.textContent = `✨ ${creatureNameEl.textContent} 降临 ✨`;
    modalDescEl.textContent = desc;
    completeModal.classList.add('show');

    if (game.getIsTempLevel()) {
      btnNext.textContent = '返回第一关';
    } else if (game.getCurrentLevel() >= MAX_LEVELS) {
      btnNext.textContent = '重新开始';
    } else {
      btnNext.textContent = '下一关';
    }
  }
});

btnUndo.addEventListener('click', () => {
  game.undoLastConnection();
});

btnReset.addEventListener('click', () => {
  if (confirm('确定要重置本关吗？所有连线将被清除。')) {
    game.resetLevel();
  }
});

btnHint.addEventListener('click', () => {
  const showing = game.toggleFrequencies();
  btnHint.textContent = showing ? '隐藏频率' : '显示频率';
});

btnNext.addEventListener('click', async () => {
  completeModal.classList.remove('show');
  btnHint.textContent = '显示频率';

  if (game.getIsTempLevel()) {
    await game.loadLevel(1);
  } else {
    const nextLevel = game.getCurrentLevel() >= MAX_LEVELS
      ? 1
      : game.getCurrentLevel() + 1;
    await game.loadLevel(nextLevel);
  }
});

btnImport.addEventListener('click', () => {
  importModal.classList.add('show');
  importTextarea.value = '';
  importErrors.classList.remove('show');
  importStatus.textContent = '';
  importTextarea.focus();
});

btnImportCancel.addEventListener('click', () => {
  importModal.classList.remove('show');
});

function showImportErrors(errors: string[]) {
  importErrorsList.innerHTML = '';
  errors.forEach(err => {
    const li = document.createElement('li');
    li.textContent = err;
    importErrorsList.appendChild(li);
  });
  importErrors.classList.add('show');
}

btnImportValidate.addEventListener('click', async () => {
  const jsonText = importTextarea.value.trim();
  if (!jsonText) {
    showImportErrors(['请输入关卡JSON数据']);
    return;
  }

  let levelData: any;
  try {
    levelData = JSON.parse(jsonText);
  } catch (e) {
    showImportErrors([`JSON解析失败: ${e instanceof Error ? e.message : String(e)}`]);
    return;
  }

  importStatus.textContent = '正在校验关卡数据...';
  importErrors.classList.remove('show');
  btnImportValidate.disabled = true;

  try {
    const result = await validateTempLevel(levelData);

    if (!result.success) {
      showImportErrors(result.errors || ['校验请求失败']);
      importStatus.textContent = '';
      btnImportValidate.disabled = false;
      return;
    }

    if (!result.valid) {
      const errorTitle = result.reason === 'structure' ? '结构校验失败' : '星脉校验失败';
      const errors = result.errors || [];
      if (result.harmonicEdges !== undefined && result.totalEdges !== undefined) {
        errors.unshift(`谐波边: ${result.harmonicEdges}/${result.totalEdges}`);
      }
      showImportErrors(errors);
      importStatus.textContent = `❌ ${errorTitle}`;
      btnImportValidate.disabled = false;
      return;
    }

    importStatus.textContent = '✅ 校验通过，正在进入试玩...';

    setTimeout(() => {
      if (result.level) {
        const loaded = game.loadLevelData(result.level);
        if (loaded) {
          importModal.classList.remove('show');
        } else {
          showImportErrors(['加载关卡失败']);
          importStatus.textContent = '';
        }
      }
      btnImportValidate.disabled = false;
    }, 500);
  } catch (e) {
    showImportErrors([`校验出错: ${e instanceof Error ? e.message : String(e)}`]);
    importStatus.textContent = '';
    btnImportValidate.disabled = false;
  }
});

async function init(): Promise<void> {
  hintTitleEl.textContent = '加载中...';
  hintTextEl.textContent = '正在连接星界数据库...';

  try {
    const backendOk = await healthCheck();
    if (!backendOk) {
      console.warn('后端未启动，尝试使用嵌入数据...');
    }
  } catch {
    console.warn('后端健康检查失败');
  }

  const loaded = await game.loadLevel(1);
  if (!loaded) {
    hintTitleEl.textContent = '⚠️ 加载失败';
    hintTextEl.textContent = '无法加载关卡数据，请确保后端服务器已启动 (npm run dev:backend)';
    return;
  }

  game.start();
}

init().catch(err => {
  console.error('初始化失败:', err);
  hintTitleEl.textContent = '错误';
  hintTextEl.textContent = String(err);
});
