const fileInput = document.querySelector("#fileInput");
const dropZone = document.querySelector("#dropZone");
const player = document.querySelector("#player");
const statusText = document.querySelector("#statusText");
const fileMeta = document.querySelector("#fileMeta");
const analyzeButton = document.querySelector("#analyzeButton");
const sensitivityInput = document.querySelector("#sensitivity");
const minDurationInput = document.querySelector("#minDuration");
const maxFretInput = document.querySelector("#maxFret");
const tabOutput = document.querySelector("#tabOutput");
const notesBody = document.querySelector("#notesBody");
const noteCount = document.querySelector("#noteCount");
const durationText = document.querySelector("#durationText");
const rangeText = document.querySelector("#rangeText");
const confidenceText = document.querySelector("#confidenceText");
const copyButton = document.querySelector("#copyButton");
const downloadTabButton = document.querySelector("#downloadTabButton");
const downloadJsonButton = document.querySelector("#downloadJsonButton");

const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const guitarStrings = [
  { name: "e", midi: 64 },
  { name: "B", midi: 59 },
  { name: "G", midi: 55 },
  { name: "D", midi: 50 },
  { name: "A", midi: 45 },
  { name: "E", midi: 40 },
];

let audioBuffer = null;
let currentFile = null;
let latestNotes = [];
let latestTab = "";

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files;
  if (file) loadFile(file);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  const [file] = event.dataTransfer.files;
  if (file) loadFile(file);
});

analyzeButton.addEventListener("click", analyzeAudio);
copyButton.addEventListener("click", copyTab);
downloadTabButton.addEventListener("click", () => downloadText("electric-tab-ai.txt", latestTab));
downloadJsonButton.addEventListener("click", () => {
  downloadText("electric-tab-ai-notes.json", JSON.stringify(latestNotes, null, 2));
});

async function loadFile(file) {
  resetResults();
  currentFile = file;
  statusText.textContent = "正在解码音频，请稍等...";
  fileMeta.textContent = `${file.name} · ${formatBytes(file.size)}`;
  player.src = URL.createObjectURL(file);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    await audioContext.close();
    statusText.textContent = "文件已加载，可以开始扒谱";
    durationText.textContent = `${audioBuffer.duration.toFixed(1)}s`;
    analyzeButton.disabled = false;
  } catch (error) {
    console.error(error);
    statusText.textContent = "浏览器无法解码该文件，请换成 mp3、wav 或常见编码的 mp4";
    analyzeButton.disabled = true;
  }
}

function resetResults() {
  audioBuffer = null;
  latestNotes = [];
  latestTab = "";
  tabOutput.textContent = "上传文件后，TAB 谱会显示在这里。";
  notesBody.innerHTML = '<tr><td colspan="6">暂无数据</td></tr>';
  noteCount.textContent = "0";
  durationText.textContent = "0s";
  rangeText.textContent = "--";
  confidenceText.textContent = "0%";
  copyButton.disabled = true;
  downloadTabButton.disabled = true;
  downloadJsonButton.disabled = true;
}

async function analyzeAudio() {
  if (!audioBuffer) return;
  analyzeButton.disabled = true;
  statusText.textContent = "正在分析音高和节奏...";

  await waitForPaint();
  const options = {
    sensitivity: Number(sensitivityInput.value),
    minDuration: Number(minDurationInput.value),
    maxFret: Number(maxFretInput.value),
  };

  const mono = mixToMono(audioBuffer);
  const rawFrames = detectPitchFrames(mono, audioBuffer.sampleRate, options);
  latestNotes = mergeFramesIntoNotes(rawFrames, options).map((note) => ({
    ...note,
    position: chooseGuitarPosition(note.midi, options.maxFret),
  })).filter((note) => note.position);

  latestTab = buildTab(latestNotes, audioBuffer.duration, currentFile?.name || "未命名音频");
  renderResults(latestNotes, latestTab, audioBuffer.duration);
  statusText.textContent = latestNotes.length > 0 ? "分析完成，可复制或下载结果" : "没有检测到稳定单音旋律，请尝试提高音量或降低灵敏度";
  analyzeButton.disabled = false;
}

function mixToMono(buffer) {
  const length = buffer.length;
  const mono = new Float32Array(length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      mono[i] += data[i] / buffer.numberOfChannels;
    }
  }
  return mono;
}

function detectPitchFrames(samples, sampleRate, options) {
  const frameSize = 2048;
  const hopSize = 1024;
  const minFrequency = 73;
  const maxFrequency = 1100;
  const minLag = Math.floor(sampleRate / maxFrequency);
  const maxLag = Math.floor(sampleRate / minFrequency);
  const frames = [];

  for (let start = 0; start + frameSize < samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    const rms = rootMeanSquare(frame);
    if (rms < 0.012) continue;

    const result = autoCorrelate(frame, sampleRate, minLag, maxLag);
    if (!result || result.confidence < options.sensitivity) continue;

    const midi = frequencyToMidi(result.frequency);
    if (midi < 40 || midi > 88) continue;

    frames.push({
      time: start / sampleRate,
      frequency: result.frequency,
      midi: Math.round(midi),
      confidence: result.confidence,
      rms,
    });
  }

  return frames;
}

function autoCorrelate(frame, sampleRate, minLag, maxLag) {
  let bestLag = -1;
  let bestCorrelation = 0;
  let frameEnergy = 0;

  for (let i = 0; i < frame.length; i += 1) {
    frameEnergy += frame[i] * frame[i];
  }

  if (frameEnergy === 0) return null;

  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    for (let i = 0; i < frame.length - lag; i += 1) {
      correlation += frame[i] * frame[i + lag];
    }
    correlation /= frameEnergy;

    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestLag = lag;
    }
  }

  if (bestLag < 0) return null;

  const refinedLag = refineLag(frame, bestLag);
  return {
    frequency: sampleRate / refinedLag,
    confidence: Math.max(0, Math.min(1, bestCorrelation)),
  };
}

function refineLag(frame, lag) {
  const score = (candidate) => {
    let sum = 0;
    for (let i = 0; i < frame.length - candidate; i += 1) {
      sum += frame[i] * frame[i + candidate];
    }
    return sum;
  };

  const left = lag > 1 ? score(lag - 1) : score(lag);
  const center = score(lag);
  const right = score(lag + 1);
  const divisor = 2 * (2 * center - left - right);
  if (Math.abs(divisor) < 0.0001) return lag;
  return lag + (right - left) / divisor;
}

function mergeFramesIntoNotes(frames, options) {
  if (frames.length === 0) return [];
  const notes = [];
  let active = createNote(frames[0]);

  for (let i = 1; i < frames.length; i += 1) {
    const frame = frames[i];
    const gap = frame.time - active.lastTime;
    if (Math.abs(frame.midi - active.midi) <= 1 && gap < 0.16) {
      active.midi = Math.round((active.midi * active.count + frame.midi) / (active.count + 1));
      active.frequency = (active.frequency * active.count + frame.frequency) / (active.count + 1);
      active.confidence = (active.confidence * active.count + frame.confidence) / (active.count + 1);
      active.lastTime = frame.time;
      active.count += 1;
    } else {
      pushIfLongEnough(notes, active, options.minDuration);
      active = createNote(frame);
    }
  }

  pushIfLongEnough(notes, active, options.minDuration);
  return notes;
}

function createNote(frame) {
  return {
    start: frame.time,
    end: frame.time,
    lastTime: frame.time,
    midi: frame.midi,
    frequency: frame.frequency,
    confidence: frame.confidence,
    count: 1,
  };
}

function pushIfLongEnough(notes, note, minDuration) {
  const duration = Math.max(0.08, note.lastTime - note.start + 0.08);
  if (duration >= minDuration || note.count >= 2) {
    notes.push({
      start: note.start,
      end: note.lastTime + 0.08,
      duration,
      midi: note.midi,
      frequency: note.frequency,
      confidence: note.confidence,
      name: midiToNoteName(note.midi),
    });
  }
}

function chooseGuitarPosition(midi, maxFret) {
  const candidates = guitarStrings
    .map((string, index) => ({
      string: string.name,
      stringIndex: index,
      fret: midi - string.midi,
    }))
    .filter((position) => position.fret >= 0 && position.fret <= maxFret);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    const aScore = Math.abs(a.fret - 7) + a.stringIndex * 0.25;
    const bScore = Math.abs(b.fret - 7) + b.stringIndex * 0.25;
    return aScore - bScore;
  });
  return candidates[0];
}

function buildTab(notes, totalDuration, fileName) {
  if (notes.length === 0) {
    return "没有生成 TAB。建议使用主旋律清晰、背景噪声较少的音频。";
  }

  const steps = Math.max(32, Math.ceil(totalDuration / 0.25));
  const lines = guitarStrings.map((string) => ({
    name: string.name,
    cells: Array.from({ length: steps }, () => "-"),
  }));

  for (const note of notes) {
    const step = Math.min(steps - 1, Math.max(0, Math.round((note.start / totalDuration) * (steps - 1))));
    const targetLine = lines[note.position.stringIndex];
    const fret = String(note.position.fret);
    targetLine.cells[step] = fret;
    for (let i = 1; i < fret.length && step + i < targetLine.cells.length; i += 1) {
      targetLine.cells[step + i] = "";
    }
  }

  const header = [
    `Electric Tab AI 自动扒谱结果`,
    `文件：${fileName}`,
    `说明：标准调弦 E A D G B e；结果来自浏览器端音高检测，适合单音旋律和电吉他独奏初稿。`,
    "",
  ];

  const tabLines = lines.map((line) => `${line.name}|${line.cells.join("")}|`);
  const noteList = notes
    .slice(0, 80)
    .map((note) => {
      const start = note.start.toFixed(2).padStart(6, " ");
      const fret = String(note.position.fret).padStart(2, " ");
      return `${start}s  ${note.name.padEnd(3, " ")}  ${note.position.string} string fret ${fret}`;
    });

  return [...header, ...tabLines, "", "音符列表：", ...noteList].join("\n");
}

function renderResults(notes, tab, duration) {
  tabOutput.textContent = tab;
  noteCount.textContent = String(notes.length);
  durationText.textContent = `${duration.toFixed(1)}s`;

  if (notes.length > 0) {
    const midiValues = notes.map((note) => note.midi);
    rangeText.textContent = `${midiToNoteName(Math.min(...midiValues))} - ${midiToNoteName(Math.max(...midiValues))}`;
    const averageConfidence = notes.reduce((sum, note) => sum + note.confidence, 0) / notes.length;
    confidenceText.textContent = `${Math.round(averageConfidence * 100)}%`;
  }

  notesBody.innerHTML = notes
    .map((note) => `
      <tr>
        <td>${note.start.toFixed(2)}s</td>
        <td>${note.name}</td>
        <td>${note.frequency.toFixed(1)} Hz</td>
        <td>${note.position.string}</td>
        <td>${note.position.fret}</td>
        <td>${Math.round(note.confidence * 100)}%</td>
      </tr>
    `)
    .join("");

  copyButton.disabled = false;
  downloadTabButton.disabled = false;
  downloadJsonButton.disabled = false;
}

async function copyTab() {
  if (!latestTab) return;
  await navigator.clipboard.writeText(latestTab);
  statusText.textContent = "TAB 已复制到剪贴板";
}

function downloadText(fileName, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

function midiToNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return `${noteNames[((midi % 12) + 12) % 12]}${octave}`;
}

function rootMeanSquare(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i += 1) {
    sum += frame[i] * frame[i];
  }
  return Math.sqrt(sum / frame.length);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function waitForPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
