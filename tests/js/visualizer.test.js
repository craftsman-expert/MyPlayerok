const assert = require('assert');
const path = require('path');

const visualizer = require(path.join(__dirname, '../../public/visualizer.js'));
const {
    VisualizerSettings,
    VisualizerEngine,
    SUPPORTED_MODES,
    THEMES,
} = visualizer;

function createStorageMock() {
    const store = new Map();
    return {
        getItem(key) {
            return store.has(key) ? store.get(key) : null;
        },
        setItem(key, value) {
            store.set(key, value);
        },
        removeItem(key) {
            store.delete(key);
        },
    };
}

function createAnalyserStub() {
    let fftSize = 2048;
    return {
        get fftSize() {
            return fftSize;
        },
        set fftSize(value) {
            fftSize = value;
        },
        get frequencyBinCount() {
            return fftSize / 2;
        },
        smoothingTimeConstant: 0,
        getByteFrequencyData(target) {
            for (let index = 0; index < target.length; index += 1) {
                target[index] = index % 255;
            }
        },
        getByteTimeDomainData(target) {
            for (let index = 0; index < target.length; index += 1) {
                target[index] = 128;
            }
        },
        connect() {},
    };
}

function createAudioContextStub() {
    let analyser = createAnalyserStub();
    return {
        state: 'running',
        resume() {
            this.state = 'running';
        },
        createAnalyser() {
            analyser = createAnalyserStub();
            return analyser;
        },
        createMediaElementSource() {
            return {
                connect() {},
            };
        },
        get destination() {
            return {};
        },
    };
}

function createCanvasStub() {
    const gradientStub = {
        addColorStop() {},
    };
    const ctx = {
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        shadowBlur: 0,
        shadowColor: '',
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        fillRect() {},
        fill() {},
        closePath() {},
        quadraticCurveTo() {},
        arc() {},
        save() {},
        restore() {},
        setTransform() {},
        createLinearGradient() {
            return gradientStub;
        },
        createRadialGradient() {
            return gradientStub;
        },
    };
    return {
        width: 0,
        height: 0,
        style: {},
        getContext(type) {
            return type === '2d' ? ctx : null;
        },
    };
}

function createAudioStub() {
    return {
        paused: true,
        addEventListener() {},
        removeEventListener() {},
    };
}

const tests = [];
function test(name, fn) {
    tests.push({ name, fn });
}

test('settings persist between instances', () => {
    const storage = createStorageMock();
    const defaults = {
        enabled: false,
        mode: 'bars',
        sensitivity: 0.75,
        smoothing: 0.5,
        theme: 'neon',
    };
    const manager = new VisualizerSettings({
        storage,
        storageKey: 'visualizer-test',
        defaults,
        modes: SUPPORTED_MODES,
        themes: Object.keys(THEMES),
    });
    let loaded = manager.load();
    assert.strictEqual(loaded.enabled, false);
    manager.update({
        enabled: true,
        mode: 'rings',
        sensitivity: 1.15,
        smoothing: 0.9,
        theme: 'sunset',
    });
    loaded = manager.load();
    assert.strictEqual(loaded.mode, 'rings');
    assert.ok(Math.abs(loaded.sensitivity - 1.15) < 1e-6);
    const secondManager = new VisualizerSettings({
        storage,
        storageKey: 'visualizer-test',
        defaults,
        modes: SUPPORTED_MODES,
        themes: Object.keys(THEMES),
    });
    const persisted = secondManager.load();
    assert.strictEqual(persisted.theme, 'sunset');
    assert.strictEqual(persisted.enabled, true);
});

test('mode switching updates the engine state', () => {
    const audio = createAudioStub();
    const canvas = createCanvasStub();
    const engine = new VisualizerEngine(audio, canvas, {
        initialSettings: {
            enabled: false,
            mode: 'bars',
            sensitivity: 0.9,
            smoothing: 0.6,
            theme: 'neon',
        },
        audioContextFactory: () => createAudioContextStub(),
        requestAnimationFrame: () => 1,
        cancelAnimationFrame: () => {},
    });
    engine.setMode('wave');
    assert.strictEqual(engine.settings.mode, 'wave');
    engine.setMode('invalid');
    assert.strictEqual(engine.settings.mode, 'wave');
});

test('engine starts on play and stops on pause', () => {
    const audio = createAudioStub();
    const canvas = createCanvasStub();
    const context = createAudioContextStub();
    let rafCalls = 0;
    let cancelCalls = 0;
    const engine = new VisualizerEngine(audio, canvas, {
        initialSettings: {
            enabled: true,
            mode: 'bars',
            sensitivity: 1,
            smoothing: 0.5,
            theme: 'neon',
        },
        requestAnimationFrame: () => {
            rafCalls += 1;
            return 1;
        },
        cancelAnimationFrame: () => {
            cancelCalls += 1;
        },
        audioContextFactory: () => context,
    });
    engine.setPageVisibility(true);
    audio.paused = false;
    engine.handlePlay();
    assert.ok(rafCalls > 0, 'requestAnimationFrame should be called when playing');
    engine.handlePause();
    assert.ok(cancelCalls > 0, 'cancelAnimationFrame should be called when paused');
});

let failures = 0;
for (const { name, fn } of tests) {
    try {
        fn();
        console.log(`✔ ${name}`);
    } catch (error) {
        failures += 1;
        console.error(`✖ ${name}`);
        console.error(error);
    }
}

if (failures > 0) {
    process.exitCode = 1;
} else {
    console.log('All visualizer tests passed');
}
