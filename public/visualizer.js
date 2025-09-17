(function (global) {
    'use strict';

    const defaultWindow = typeof window !== 'undefined' && window.document ? window : (global && global.document ? global : undefined);

    const fallbackRequestAnimationFrame = (callback) => setTimeout(() => callback(Date.now()), 16);
    const fallbackCancelAnimationFrame = (handle) => clearTimeout(handle);

    const SUPPORTED_MODES = ['bars', 'wave', 'rings', 'particles'];

    const THEMES = {
        neon: {
            background: 'rgba(15, 23, 42, 0.65)',
            gradient: ['#38bdf8', '#c084fc'],
            accent: '#f472b6',
            glow: 'rgba(56, 189, 248, 0.45)',
            particle: '#38bdf8',
        },
        aurora: {
            background: 'rgba(4, 30, 49, 0.7)',
            gradient: ['#22d3ee', '#34d399'],
            accent: '#fef3c7',
            glow: 'rgba(52, 211, 153, 0.45)',
            particle: '#34d399',
        },
        sunset: {
            background: 'rgba(58, 12, 35, 0.72)',
            gradient: ['#f97316', '#fb7185'],
            accent: '#fde047',
            glow: 'rgba(249, 115, 22, 0.45)',
            particle: '#fb7185',
        },
        light: {
            background: 'rgba(248, 250, 252, 0.92)',
            gradient: ['#64748b', '#0ea5e9'],
            accent: '#6366f1',
            glow: 'rgba(148, 163, 184, 0.4)',
            particle: '#475569',
        },
    };

    const DEFAULT_SETTINGS = {
        enabled: true,
        mode: 'bars',
        sensitivity: 0.85,
        smoothing: 0.6,
        theme: 'neon',
    };

    function clamp(value, min, max) {
        if (!Number.isFinite(value)) {
            return min;
        }
        return Math.min(max, Math.max(min, value));
    }

    function createDefaultAudioContextFactory(win) {
        return function defaultFactory() {
            const contextWindow = win && win.AudioContext ? win : (typeof window !== 'undefined' ? window : undefined);
            const AudioContextConstructor = contextWindow ? (contextWindow.AudioContext || contextWindow.webkitAudioContext) : undefined;
            if (!AudioContextConstructor) {
                return null;
            }
            try {
                return new AudioContextConstructor();
            } catch (error) {
                return null;
            }
        };
    }

    function isDomElement(value) {
        if (!value || typeof value !== 'object') {
            return false;
        }
        return typeof Element === 'undefined' || value instanceof Element;
    }

    class VisualizerSettings {
        constructor(options = {}) {
            this.storage = options.storage && typeof options.storage.getItem === 'function' ? options.storage : null;
            this.storageKey = typeof options.storageKey === 'string' && options.storageKey.trim() !== ''
                ? options.storageKey
                : 'myplayer.visualizer';
            this.availableModes = Array.isArray(options.modes) && options.modes.length ? options.modes.slice() : SUPPORTED_MODES.slice();
            this.availableThemes = Array.isArray(options.themes) && options.themes.length ? options.themes.slice() : Object.keys(THEMES);
            const defaults = options.defaults && typeof options.defaults === 'object' ? options.defaults : {};
            this.defaults = Object.assign({}, DEFAULT_SETTINGS, defaults);
            this.cache = null;
        }

        normalize(settings) {
            const normalized = Object.assign({}, this.defaults);

            normalized.enabled = Boolean(settings.enabled);

            const requestedMode = typeof settings.mode === 'string' ? settings.mode : this.defaults.mode;
            normalized.mode = this.availableModes.includes(requestedMode) ? requestedMode : this.defaults.mode;

            const requestedSensitivity = Number.parseFloat(settings.sensitivity);
            normalized.sensitivity = clamp(Number.isFinite(requestedSensitivity) ? requestedSensitivity : this.defaults.sensitivity, 0.1, 2);

            const requestedSmoothing = Number.parseFloat(settings.smoothing);
            normalized.smoothing = clamp(Number.isFinite(requestedSmoothing) ? requestedSmoothing : this.defaults.smoothing, 0, 0.99);

            const requestedTheme = typeof settings.theme === 'string' ? settings.theme : this.defaults.theme;
            normalized.theme = this.availableThemes.includes(requestedTheme) ? requestedTheme : this.defaults.theme;

            return normalized;
        }

        load() {
            if (this.cache) {
                return Object.assign({}, this.cache);
            }

            let payload = {};
            if (this.storage) {
                try {
                    const raw = this.storage.getItem(this.storageKey);
                    if (typeof raw === 'string' && raw.trim() !== '') {
                        payload = JSON.parse(raw);
                    }
                } catch (error) {
                    payload = {};
                }
            }

            this.cache = this.normalize(Object.assign({}, this.defaults, payload));

            return Object.assign({}, this.cache);
        }

        save(settings) {
            this.cache = this.normalize(settings || {});
            if (this.storage) {
                try {
                    this.storage.setItem(this.storageKey, JSON.stringify(this.cache));
                } catch (error) {
                    // ignore storage write failures
                }
            }

            return Object.assign({}, this.cache);
        }

        update(partial) {
            const current = this.load();
            const merged = Object.assign({}, current, partial || {});

            return this.save(merged);
        }
    }

    class VisualizerEngine {
        constructor(audioElement, canvasElement, options = {}) {
            this.audio = audioElement;
            this.canvas = canvasElement;
            this.ctx = this.canvas && typeof this.canvas.getContext === 'function' ? this.canvas.getContext('2d') : null;
            const initial = Object.assign({}, DEFAULT_SETTINGS, options.initialSettings || {});
            this.settings = this.validateSettings(initial);
            this.theme = THEMES[this.settings.theme] || THEMES.neon;
            this.requestAnimationFrame = typeof options.requestAnimationFrame === 'function'
                ? options.requestAnimationFrame
                : (defaultWindow && defaultWindow.requestAnimationFrame ? defaultWindow.requestAnimationFrame.bind(defaultWindow) : fallbackRequestAnimationFrame);
            this.cancelAnimationFrame = typeof options.cancelAnimationFrame === 'function'
                ? options.cancelAnimationFrame
                : (defaultWindow && defaultWindow.cancelAnimationFrame ? defaultWindow.cancelAnimationFrame.bind(defaultWindow) : fallbackCancelAnimationFrame);
            this.audioContextFactory = typeof options.audioContextFactory === 'function'
                ? options.audioContextFactory
                : createDefaultAudioContextFactory(defaultWindow);
            this.onStateChange = typeof options.onStateChange === 'function' ? options.onStateChange : null;

            this.frameId = null;
            this.isRendering = false;
            this.pageVisible = true;
            this.pixelRatio = 1;
            this.viewportWidth = 0;
            this.viewportHeight = 0;

            this.audioContext = null;
            this.analyser = null;
            this.sourceNode = null;
            this.audioGraphConnected = false;
            this.frequencyData = null;
            this.timeDomainData = null;
            this.particles = [];

            this.gradientCache = { height: 0, gradient: null };

            this.renderStep = this.renderStep.bind(this);
            this.notifyState(this.settings.enabled ? 'idle' : 'disabled');
        }

        validateSettings(settings) {
            return {
                enabled: Boolean(settings.enabled),
                mode: SUPPORTED_MODES.includes(settings.mode) ? settings.mode : DEFAULT_SETTINGS.mode,
                sensitivity: clamp(Number.parseFloat(settings.sensitivity), 0.1, 2) || DEFAULT_SETTINGS.sensitivity,
                smoothing: clamp(Number.parseFloat(settings.smoothing), 0, 0.99) || DEFAULT_SETTINGS.smoothing,
                theme: typeof settings.theme === 'string' && THEMES[settings.theme] ? settings.theme : DEFAULT_SETTINGS.theme,
            };
        }

        notifyState(state) {
            this.currentState = state;
            if (this.onStateChange) {
                try {
                    this.onStateChange(state);
                } catch (error) {
                    // suppress listener errors
                }
            }
        }

        setDimensions(width, height, pixelRatio = 1) {
            this.viewportWidth = width;
            this.viewportHeight = height;
            this.pixelRatio = pixelRatio;
            if (this.ctx && typeof this.ctx.setTransform === 'function') {
                this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
            }
            this.gradientCache = { height: 0, gradient: null };
        }

        getWidth() {
            return this.viewportWidth || (this.canvas ? this.canvas.width / this.pixelRatio : 0);
        }

        getHeight() {
            return this.viewportHeight || (this.canvas ? this.canvas.height / this.pixelRatio : 0);
        }

        setPageVisibility(isVisible) {
            this.pageVisible = Boolean(isVisible);
            if (!this.pageVisible) {
                this.stopRendering();
                if (this.settings.enabled) {
                    this.notifyState('idle');
                }
                return;
            }
            if (this.settings.enabled && this.audio && !this.audio.paused) {
                this.handlePlay();
            }
        }

        setEnabled(enabled) {
            const value = Boolean(enabled);
            if (this.settings.enabled === value) {
                if (!value) {
                    this.notifyState('disabled');
                }
                return this.settings.enabled;
            }

            this.settings.enabled = value;
            if (!value) {
                this.stopRendering();
                this.notifyState('disabled');
                return this.settings.enabled;
            }

            this.notifyState('idle');
            if (this.audio && !this.audio.paused && this.pageVisible) {
                this.handlePlay();
            }

            return this.settings.enabled;
        }

        setMode(mode) {
            if (!SUPPORTED_MODES.includes(mode)) {
                return this.settings.mode;
            }
            this.settings.mode = mode;
            return this.settings.mode;
        }

        setSensitivity(value) {
            const normalized = clamp(Number.parseFloat(value), 0.1, 2) || this.settings.sensitivity;
            this.settings.sensitivity = normalized;
            return this.settings.sensitivity;
        }

        setSmoothing(value) {
            const normalized = clamp(Number.parseFloat(value), 0, 0.99) || this.settings.smoothing;
            this.settings.smoothing = normalized;
            if (this.analyser) {
                this.analyser.smoothingTimeConstant = this.settings.smoothing;
            }
            return this.settings.smoothing;
        }

        setTheme(theme) {
            if (typeof theme !== 'string' || !THEMES[theme]) {
                return this.settings.theme;
            }
            this.settings.theme = theme;
            this.theme = THEMES[theme];
            this.gradientCache = { height: 0, gradient: null };
            return this.settings.theme;
        }

        applySettings(settings) {
            if (!settings) {
                return;
            }
            this.setTheme(settings.theme);
            this.setMode(settings.mode);
            this.setSensitivity(settings.sensitivity);
            this.setSmoothing(settings.smoothing);
            this.setEnabled(settings.enabled);
        }

        ensureAnalyser() {
            if (!this.ctx || !this.canvas || !this.audio) {
                return false;
            }

            if (!this.audioContext) {
                this.audioContext = this.audioContextFactory ? this.audioContextFactory() : null;
            }

            if (!this.audioContext) {
                return false;
            }

            if (typeof this.audioContext.resume === 'function' && this.audioContext.state === 'suspended') {
                try {
                    this.audioContext.resume();
                } catch (error) {
                    // ignore resume errors
                }
            }

            if (!this.analyser) {
                if (typeof this.audioContext.createAnalyser !== 'function' || typeof this.audioContext.createMediaElementSource !== 'function') {
                    return false;
                }
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 2048;
                this.analyser.smoothingTimeConstant = this.settings.smoothing;
                this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
                this.timeDomainData = new Uint8Array(this.analyser.fftSize);
                if (!this.sourceNode) {
                    try {
                        this.sourceNode = this.audioContext.createMediaElementSource(this.audio);
                    } catch (error) {
                        if (!this.sourceNode) {
                            return false;
                        }
                    }
                }
                if (!this.audioGraphConnected && this.sourceNode) {
                    if (typeof this.sourceNode.connect === 'function') {
                        this.sourceNode.connect(this.analyser);
                        if (this.audioContext.destination) {
                            this.analyser.connect(this.audioContext.destination);
                        }
                    }
                    this.audioGraphConnected = true;
                }
            }

            if (!this.frequencyData || this.frequencyData.length !== this.analyser.frequencyBinCount) {
                this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            }
            if (!this.timeDomainData || this.timeDomainData.length !== this.analyser.fftSize) {
                this.timeDomainData = new Uint8Array(this.analyser.fftSize);
            }

            this.analyser.smoothingTimeConstant = this.settings.smoothing;

            return true;
        }

        handlePlay() {
            if (!this.settings.enabled || !this.pageVisible) {
                return;
            }
            if (!this.ensureAnalyser()) {
                return;
            }
            this.notifyState('running');
            this.startRendering();
        }

        handlePause() {
            this.stopRendering();
            this.notifyState(this.settings.enabled ? 'idle' : 'disabled');
        }

        startRendering() {
            if (this.isRendering) {
                return;
            }
            this.isRendering = true;
            this.frameId = this.requestAnimationFrame(this.renderStep);
        }

        renderStep() {
            if (!this.isRendering) {
                return;
            }
            this.renderFrame();
            this.frameId = this.requestAnimationFrame(this.renderStep);
        }

        stopRendering() {
            if (!this.isRendering) {
                return;
            }
            this.isRendering = false;
            if (this.frameId !== null) {
                this.cancelAnimationFrame(this.frameId);
                this.frameId = null;
            }
        }

        renderFrame() {
            if (!this.analyser || !this.ctx) {
                return;
            }
            switch (this.settings.mode) {
                case 'wave':
                    this.renderWave();
                    break;
                case 'rings':
                    this.renderRings();
                    break;
                case 'particles':
                    this.renderParticles();
                    break;
                case 'bars':
                default:
                    this.renderBars();
                    break;
            }
        }

        prepareBackground(alphaFactor) {
            const width = this.getWidth();
            const height = this.getHeight();
            if (width === 0 || height === 0) {
                return;
            }
            const ctx = this.ctx;
            ctx.save();
            ctx.globalCompositeOperation = 'source-over';
            const base = this.theme.background;
            if (typeof alphaFactor === 'number' && base.startsWith('rgba')) {
                const segments = base.slice(5, -1).split(',').map((item) => item.trim());
                if (segments.length === 4) {
                    segments[3] = String(alphaFactor);
                    ctx.fillStyle = `rgba(${segments.join(', ')})`;
                } else {
                    ctx.fillStyle = base;
                }
            } else {
                ctx.fillStyle = base;
            }
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        obtainGradient(height) {
            if (!this.ctx) {
                return this.theme.gradient[0];
            }
            if (!this.gradientCache.gradient || this.gradientCache.height !== height) {
                const gradient = this.ctx.createLinearGradient(0, height, 0, 0);
                gradient.addColorStop(0, this.theme.gradient[0]);
                gradient.addColorStop(1, this.theme.gradient[1]);
                this.gradientCache = { height, gradient };
            }
            return this.gradientCache.gradient;
        }

        renderBars() {
            this.analyser.getByteFrequencyData(this.frequencyData);
            const width = this.getWidth();
            const height = this.getHeight();
            if (width === 0 || height === 0) {
                return;
            }
            this.prepareBackground();
            const ctx = this.ctx;
            const barCount = 64;
            const slice = Math.max(1, Math.floor(this.frequencyData.length / barCount));
            const barWidth = width / barCount;
            ctx.save();
            ctx.fillStyle = this.obtainGradient(height);
            ctx.shadowBlur = 18;
            ctx.shadowColor = this.theme.glow;
            for (let index = 0; index < barCount; index += 1) {
                const sampleIndex = index * slice;
                const sample = this.frequencyData[Math.min(sampleIndex, this.frequencyData.length - 1)] / 255;
                const magnitude = Math.pow(sample, 1.35) * height * 0.9 * this.settings.sensitivity;
                const barHeight = Math.max(4, magnitude);
                const x = index * barWidth;
                const y = height - barHeight;
                ctx.beginPath();
                const radius = Math.min(barWidth / 2.5, 12);
                const adjustedWidth = barWidth * 0.65;
                const offsetX = x + (barWidth - adjustedWidth) / 2;
                ctx.moveTo(offsetX, height);
                ctx.lineTo(offsetX, y + radius);
                ctx.quadraticCurveTo(offsetX, y, offsetX + radius, y);
                ctx.lineTo(offsetX + adjustedWidth - radius, y);
                ctx.quadraticCurveTo(offsetX + adjustedWidth, y, offsetX + adjustedWidth, y + radius);
                ctx.lineTo(offsetX + adjustedWidth, height);
                ctx.closePath();
                ctx.fill();
            }
            ctx.restore();
        }

        renderWave() {
            this.analyser.getByteTimeDomainData(this.timeDomainData);
            const width = this.getWidth();
            const height = this.getHeight();
            if (width === 0 || height === 0) {
                return;
            }
            this.prepareBackground(0.85);
            const ctx = this.ctx;
            ctx.save();
            ctx.lineWidth = Math.max(1.5, this.settings.sensitivity * 2.2);
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowBlur = 14;
            ctx.shadowColor = this.theme.glow;
            ctx.strokeStyle = this.theme.gradient[0];
            ctx.beginPath();
            const slice = width / this.timeDomainData.length;
            let x = 0;
            for (let i = 0; i < this.timeDomainData.length; i += 1) {
                const value = (this.timeDomainData[i] / 255) * 2 - 1;
                const amplitude = value * (height / 2) * this.settings.sensitivity;
                const y = height / 2 + amplitude;
                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
                x += slice;
            }
            ctx.stroke();
            ctx.restore();
        }

        renderRings() {
            this.analyser.getByteFrequencyData(this.frequencyData);
            const width = this.getWidth();
            const height = this.getHeight();
            if (width === 0 || height === 0) {
                return;
            }
            this.prepareBackground(0.75);
            const ctx = this.ctx;
            const centerX = width / 2;
            const centerY = height / 2;
            const ringCount = 3;
            const maxRadius = Math.min(width, height) / 2.4;
            ctx.save();
            ctx.lineWidth = 2.2;
            ctx.shadowBlur = 16;
            ctx.shadowColor = this.theme.glow;
            for (let ring = 0; ring < ringCount; ring += 1) {
                const baseRadius = (maxRadius / ringCount) * (ring + 1);
                const offset = ring * 32;
                ctx.beginPath();
                const steps = 120;
                for (let step = 0; step <= steps; step += 1) {
                    const index = Math.min(offset + step, this.frequencyData.length - 1);
                    const sample = this.frequencyData[index] / 255;
                    const dynamicRadius = baseRadius + sample * maxRadius * 0.3 * this.settings.sensitivity;
                    const angle = (step / steps) * Math.PI * 2;
                    const x = centerX + Math.cos(angle) * dynamicRadius;
                    const y = centerY + Math.sin(angle) * dynamicRadius;
                    if (step === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.closePath();
                const gradient = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.2, centerX, centerY, baseRadius);
                gradient.addColorStop(0, this.theme.gradient[1]);
                gradient.addColorStop(1, this.theme.gradient[0]);
                ctx.strokeStyle = gradient;
                ctx.stroke();
            }
            ctx.restore();
        }

        initParticles(count) {
            this.particles = [];
            for (let index = 0; index < count; index += 1) {
                this.particles.push({
                    angle: (Math.PI * 2 * index) / count,
                    speed: 0.004 + Math.random() * 0.003,
                    baseRadius: 0.35 + Math.random() * 0.65,
                    size: 2 + Math.random() * 3,
                });
            }
        }

        getAverageFrequency() {
            if (!this.frequencyData || !this.frequencyData.length) {
                return 0;
            }
            let sum = 0;
            for (let i = 0; i < this.frequencyData.length; i += 1) {
                sum += this.frequencyData[i];
            }
            return sum / this.frequencyData.length / 255;
        }

        renderParticles() {
            this.analyser.getByteFrequencyData(this.frequencyData);
            const width = this.getWidth();
            const height = this.getHeight();
            if (width === 0 || height === 0) {
                return;
            }
            if (!this.particles.length) {
                this.initParticles(90);
            }
            this.prepareBackground(0.2);
            const ctx = this.ctx;
            const centerX = width / 2;
            const centerY = height / 2;
            const radiusBase = Math.min(width, height) / 4;
            const average = this.getAverageFrequency();
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            ctx.shadowBlur = 18;
            ctx.shadowColor = this.theme.glow;
            for (let index = 0; index < this.particles.length; index += 1) {
                const particle = this.particles[index];
                const freqIndex = Math.floor((index / this.particles.length) * this.frequencyData.length);
                const sample = this.frequencyData[Math.min(freqIndex, this.frequencyData.length - 1)] / 255;
                particle.angle += particle.speed * (0.5 + average * 1.5);
                const dynamicRadius = radiusBase * particle.baseRadius + sample * radiusBase * this.settings.sensitivity * 1.2;
                const x = centerX + Math.cos(particle.angle) * dynamicRadius;
                const y = centerY + Math.sin(particle.angle) * dynamicRadius;
                const size = particle.size * (0.4 + sample * 1.4);
                ctx.beginPath();
                ctx.globalAlpha = 0.45 + sample * 0.55;
                ctx.fillStyle = this.theme.particle;
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }
    }

    function attachVisualizer(options = {}) {
        const root = options.root;
        const audio = options.audio;
        if (!root || !audio) {
            return null;
        }

        const canvas = root.querySelector('#visualizer');
        if (!canvas || typeof canvas.getContext !== 'function') {
            return null;
        }

        const windowRef = options.window || defaultWindow;
        const documentRef = options.document || (windowRef ? windowRef.document : undefined);
        const storage = options.storage && typeof options.storage.getItem === 'function'
            ? options.storage
            : (windowRef && windowRef.localStorage ? windowRef.localStorage : null);

        let defaults = {};
        const defaultsAttr = root.getAttribute('data-visualizer-defaults');
        if (defaultsAttr) {
            try {
                const parsed = JSON.parse(defaultsAttr);
                if (parsed && typeof parsed === 'object') {
                    defaults = parsed;
                }
            } catch (error) {
                defaults = {};
            }
        }

        const settingsManager = new VisualizerSettings({
            storage,
            storageKey: options.storageKey || 'myplayer.visualizer',
            defaults,
            modes: SUPPORTED_MODES,
            themes: Object.keys(THEMES),
        });

        let settings = settingsManager.load();

        const toggle = root.querySelector('[data-visualizer-toggle]');
        const modeButtons = Array.from(root.querySelectorAll('[data-visualizer-mode]'));
        const sensitivityInput = root.querySelector('[data-visualizer-sensitivity]');
        const smoothingInput = root.querySelector('[data-visualizer-smoothing]');
        const themeSelect = root.querySelector('[data-visualizer-theme]');
        const placeholder = root.querySelector('[data-visualizer-placeholder]');
        const placeholderMessage = placeholder ? placeholder.querySelector('p') : null;
        const stateBadge = root.querySelector('[data-visualizer-state]');
        const sensitivityValue = root.querySelector('[data-visualizer-sensitivity-value]');
        const smoothingValue = root.querySelector('[data-visualizer-smoothing-value]');
        const canvasWrapper = root.querySelector('.visualizer-canvas');

        const engine = new VisualizerEngine(audio, canvas, {
            initialSettings: settings,
            requestAnimationFrame: options.requestAnimationFrame,
            cancelAnimationFrame: options.cancelAnimationFrame,
            audioContextFactory: options.audioContextFactory || createDefaultAudioContextFactory(windowRef),
            onStateChange: updateState,
        });

        settings = settingsManager.save(engine.settings);

        function updateTheme(theme) {
            if (typeof theme !== 'string') {
                return;
            }
            root.setAttribute('data-visualizer-theme', theme);
        }

        function updateModeButtons(mode) {
            modeButtons.forEach((button) => {
                if (!isDomElement(button)) {
                    return;
                }
                const value = button.getAttribute('data-visualizer-mode');
                button.classList.toggle('active', value === mode);
            });
        }

        function updateSensitivityLabel(value) {
            if (!sensitivityValue) {
                return;
            }
            const numeric = Number.parseFloat(value);
            const display = Number.isFinite(numeric) ? numeric.toFixed(2) : '0.00';
            sensitivityValue.textContent = `×${display}`;
        }

        function updateSmoothingLabel(value) {
            if (!smoothingValue) {
                return;
            }
            const numeric = Number.parseFloat(value);
            const display = Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
            smoothingValue.textContent = `${display}%`;
        }

        function updateState(state) {
            if (isDomElement(stateBadge)) {
                stateBadge.setAttribute('data-state', state);
                if (state === 'running') {
                    stateBadge.textContent = 'Воспроизведение';
                } else if (state === 'disabled') {
                    stateBadge.textContent = 'Выключено';
                } else {
                    stateBadge.textContent = 'Готово';
                }
            }
            if (isDomElement(placeholder)) {
                if (state === 'running') {
                    placeholder.setAttribute('data-state', 'hidden');
                } else {
                    placeholder.setAttribute('data-state', 'visible');
                    if (placeholderMessage) {
                        if (state === 'disabled') {
                            placeholderMessage.textContent = 'Визуализация выключена';
                        } else if (documentRef && documentRef.hidden) {
                            placeholderMessage.textContent = 'Вкладка свернута — визуализация на паузе';
                        } else if (audio.paused) {
                            placeholderMessage.textContent = 'Воспроизведите трек, чтобы увидеть визуализацию';
                        } else {
                            placeholderMessage.textContent = 'Ожидание аудиосигнала';
                        }
                    }
                }
            }
        }

        function syncUI() {
            if (toggle && typeof toggle === 'object' && 'checked' in toggle) {
                toggle.checked = Boolean(settings.enabled);
            }
            if (sensitivityInput && typeof sensitivityInput === 'object' && 'value' in sensitivityInput) {
                sensitivityInput.value = String(settings.sensitivity);
            }
            if (smoothingInput && typeof smoothingInput === 'object' && 'value' in smoothingInput) {
                smoothingInput.value = String(settings.smoothing);
            }
            if (themeSelect && typeof themeSelect === 'object' && 'value' in themeSelect) {
                themeSelect.value = settings.theme;
            }
            updateModeButtons(settings.mode);
            updateSensitivityLabel(settings.sensitivity);
            updateSmoothingLabel(settings.smoothing);
            updateTheme(settings.theme);
        }

        function updateCanvasSize() {
            if (!canvasWrapper || !canvas) {
                return;
            }
            const rect = typeof canvasWrapper.getBoundingClientRect === 'function'
                ? canvasWrapper.getBoundingClientRect()
                : { width: canvasWrapper.clientWidth, height: canvasWrapper.clientHeight };
            if (!rect || rect.width === 0 || rect.height === 0) {
                return;
            }
            const ratio = windowRef && windowRef.devicePixelRatio ? windowRef.devicePixelRatio : 1;
            canvas.width = rect.width * ratio;
            canvas.height = rect.height * ratio;
            canvas.style.width = `${rect.width}px`;
            canvas.style.height = `${rect.height}px`;
            engine.setDimensions(rect.width, rect.height, ratio);
        }

        const cleanup = [];

        if (toggle && typeof toggle.addEventListener === 'function') {
            const handler = () => {
                settings = settingsManager.update({ enabled: Boolean(toggle.checked) });
                engine.setEnabled(settings.enabled);
                syncUI();
            };
            toggle.addEventListener('change', handler);
            cleanup.push(() => toggle.removeEventListener('change', handler));
        }

        modeButtons.forEach((button) => {
            if (!isDomElement(button) || typeof button.addEventListener !== 'function') {
                return;
            }
            const mode = button.getAttribute('data-visualizer-mode');
            if (!mode) {
                return;
            }
            const handler = () => {
                settings = settingsManager.update({ mode });
                engine.setMode(settings.mode);
                updateModeButtons(settings.mode);
            };
            button.addEventListener('click', handler);
            cleanup.push(() => button.removeEventListener('click', handler));
        });

        if (sensitivityInput && typeof sensitivityInput.addEventListener === 'function') {
            const handler = () => {
                const value = Number.parseFloat(sensitivityInput.value);
                settings = settingsManager.update({ sensitivity: value });
                engine.setSensitivity(settings.sensitivity);
                updateSensitivityLabel(settings.sensitivity);
            };
            sensitivityInput.addEventListener('input', handler);
            cleanup.push(() => sensitivityInput.removeEventListener('input', handler));
        }

        if (smoothingInput && typeof smoothingInput.addEventListener === 'function') {
            const handler = () => {
                const value = Number.parseFloat(smoothingInput.value);
                settings = settingsManager.update({ smoothing: value });
                engine.setSmoothing(settings.smoothing);
                updateSmoothingLabel(settings.smoothing);
            };
            smoothingInput.addEventListener('input', handler);
            cleanup.push(() => smoothingInput.removeEventListener('input', handler));
        }

        if (themeSelect && typeof themeSelect.addEventListener === 'function') {
            const handler = () => {
                const theme = themeSelect.value;
                settings = settingsManager.update({ theme });
                engine.setTheme(settings.theme);
                updateTheme(settings.theme);
            };
            themeSelect.addEventListener('change', handler);
            cleanup.push(() => themeSelect.removeEventListener('change', handler));
        }

        const onPlay = () => engine.handlePlay();
        const onPause = () => engine.handlePause();
        const onEnded = () => engine.handlePause();
        if (typeof audio.addEventListener === 'function') {
            audio.addEventListener('play', onPlay);
            audio.addEventListener('pause', onPause);
            audio.addEventListener('ended', onEnded);
            cleanup.push(() => {
                audio.removeEventListener('play', onPlay);
                audio.removeEventListener('pause', onPause);
                audio.removeEventListener('ended', onEnded);
            });
        }

        const onVisibilityChange = () => {
            const visible = !(documentRef && documentRef.hidden);
            engine.setPageVisibility(visible);
        };
        if (documentRef && typeof documentRef.addEventListener === 'function') {
            documentRef.addEventListener('visibilitychange', onVisibilityChange);
            cleanup.push(() => documentRef.removeEventListener('visibilitychange', onVisibilityChange));
        }

        updateCanvasSize();
        let resizeObserver = null;
        if (canvasWrapper && windowRef && typeof windowRef.ResizeObserver === 'function') {
            resizeObserver = new windowRef.ResizeObserver(updateCanvasSize);
            resizeObserver.observe(canvasWrapper);
            cleanup.push(() => resizeObserver && resizeObserver.disconnect());
        } else if (windowRef && typeof windowRef.addEventListener === 'function') {
            windowRef.addEventListener('resize', updateCanvasSize);
            cleanup.push(() => windowRef.removeEventListener('resize', updateCanvasSize));
        }

        engine.setPageVisibility(!(documentRef && documentRef.hidden));
        engine.applySettings(settings);
        settings = settingsManager.save(engine.settings);
        syncUI();
        updateState(engine.currentState || (settings.enabled ? 'idle' : 'disabled'));

        return {
            engine,
            getSettings: () => Object.assign({}, settings),
            destroy() {
                cleanup.forEach((fn) => {
                    try {
                        fn();
                    } catch (error) {
                        // ignore teardown errors
                    }
                });
            },
        };
    }

    const api = {
        VisualizerSettings,
        VisualizerEngine,
        attachVisualizer,
        SUPPORTED_MODES,
        THEMES,
        DEFAULT_SETTINGS,
    };

    global.MyPlayerVisualizer = Object.assign({}, global.MyPlayerVisualizer || {}, api);

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
