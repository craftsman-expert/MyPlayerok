(function () {
    const playerRoot = document.querySelector('[data-player-root]');
    if (!playerRoot) {
        return;
    }

    let tracks = [];
    try {
        tracks = JSON.parse(playerRoot.dataset.tracks || '[]');
        if (!Array.isArray(tracks)) {
            tracks = [];
        }
    } catch (error) {
        console.warn('Не удалось разобрать список треков', error);
        tracks = [];
    }

    const audio = playerRoot.querySelector('[data-audio]');
    if (!(audio instanceof HTMLAudioElement)) {
        return;
    }

    const visualizerRoot = playerRoot.querySelector('[data-visualizer-root]');
    const visualizer = visualizerRoot && window.MyPlayerVisualizer && typeof window.MyPlayerVisualizer.attachVisualizer === 'function'
        ? window.MyPlayerVisualizer.attachVisualizer({
            root: visualizerRoot,
            audio,
            window,
            document,
        })
        : null;

    const defaultCover = playerRoot.dataset.defaultCover || '';
    const trackList = playerRoot.querySelector('[data-track-list]');
    const trackItems = trackList ? Array.from(trackList.querySelectorAll('[data-track-index]')) : [];

    const coverEl = playerRoot.querySelector('[data-current-cover]');
    const titleEl = playerRoot.querySelector('[data-current-title]');
    const metaEl = playerRoot.querySelector('[data-current-meta]');
    const currentTimeEl = playerRoot.querySelector('[data-current-time]');
    const durationEl = playerRoot.querySelector('[data-duration]');
    const progressEl = playerRoot.querySelector('[data-progress]');
    const volumeEl = playerRoot.querySelector('[data-volume]');
    const playButton = playerRoot.querySelector('[data-control="play"]');
    const nextButton = playerRoot.querySelector('[data-control="next"]');
    const prevButton = playerRoot.querySelector('[data-control="prev"]');
    const shuffleButton = playerRoot.querySelector('[data-control="shuffle"]');
    const filterButtons = Array.from(playerRoot.querySelectorAll('[data-filter-group]'));

    const state = {
        currentIndex: tracks.length ? 0 : -1,
        shuffle: false,
        history: [],
        filters: {
            artist: null,
            album: null,
        },
        queue: [],
        isPlaying: false,
    };

    function formatTime(value) {
        if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            return '0:00';
        }
        const totalSeconds = Math.floor(value);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    function updatePlayButton(isPlaying) {
        state.isPlaying = isPlaying;
        if (!(playButton instanceof HTMLElement)) {
            return;
        }
        const icon = playButton.querySelector('i');
        if (!icon) {
            return;
        }
        if (isPlaying) {
            playButton.setAttribute('aria-label', 'Пауза');
            icon.classList.remove('bi-play-fill');
            icon.classList.add('bi-pause-fill');
        } else {
            playButton.setAttribute('aria-label', 'Воспроизвести');
            icon.classList.remove('bi-pause-fill');
            icon.classList.add('bi-play-fill');
        }
    }

    function highlightActiveTrack() {
        trackItems.forEach((item) => {
            if (!(item instanceof HTMLElement)) {
                return;
            }
            const index = Number.parseInt(item.dataset.trackIndex || '-1', 10);
            if (index === state.currentIndex) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    function updateCurrentInfo(track) {
        if (coverEl instanceof HTMLImageElement) {
            coverEl.src = track.coverUrl || defaultCover;
        }
        if (titleEl) {
            titleEl.textContent = track.title || 'Неизвестный трек';
        }
        if (metaEl) {
            metaEl.textContent = `${track.artist || ''}${track.artist && track.album ? ' • ' : ''}${track.album || ''}`.trim();
        }
        if (durationEl) {
            const displayDuration = typeof track.duration === 'number' && track.duration > 0 ? formatTime(track.duration) : track.duration_formatted || '0:00';
            durationEl.textContent = displayDuration;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = '0:00';
        }
        if (progressEl instanceof HTMLInputElement) {
            progressEl.value = '0';
        }
    }

    function resetCurrentInfo() {
        if (coverEl instanceof HTMLImageElement) {
            coverEl.src = defaultCover;
        }
        if (titleEl) {
            titleEl.textContent = 'Выберите трек';
        }
        if (metaEl) {
            metaEl.textContent = '';
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = '0:00';
        }
        if (durationEl) {
            durationEl.textContent = '0:00';
        }
        if (progressEl instanceof HTMLInputElement) {
            progressEl.value = '0';
        }
    }

    function refreshQueue() {
        const visibleIndices = trackItems
            .filter((item) => item instanceof HTMLElement && !item.classList.contains('d-none'))
            .map((item) => Number.parseInt(item.dataset.trackIndex || '-1', 10))
            .filter((index) => Number.isInteger(index) && index >= 0 && index < tracks.length);
        state.queue = visibleIndices;
    }

    function ensureCurrentTrackVisible() {
        if (state.currentIndex === -1) {
            return;
        }
        const currentItem = trackItems.find((item) => Number.parseInt(item.dataset.trackIndex || '-1', 10) === state.currentIndex);
        if (currentItem instanceof HTMLElement && currentItem.classList.contains('d-none')) {
            audio.pause();
            state.currentIndex = -1;
            updatePlayButton(false);
            resetCurrentInfo();
        }
    }

    function applyFilters(group, value) {
        state.filters[group] = value || null;
        trackItems.forEach((item) => {
            if (!(item instanceof HTMLElement)) {
                return;
            }
            const trackIndex = Number.parseInt(item.dataset.trackIndex || '-1', 10);
            if (!Number.isInteger(trackIndex) || trackIndex < 0 || trackIndex >= tracks.length) {
                item.classList.add('d-none');
                return;
            }
            const track = tracks[trackIndex];
            const matchesArtist = !state.filters.artist || track.artist === state.filters.artist;
            const matchesAlbum = !state.filters.album || track.album === state.filters.album;
            if (matchesArtist && matchesAlbum) {
                item.classList.remove('d-none');
            } else {
                item.classList.add('d-none');
            }
        });
        refreshQueue();
        ensureCurrentTrackVisible();
        if (!state.queue.length) {
            audio.pause();
            updatePlayButton(false);
            resetCurrentInfo();
        }
    }

    function setShuffle(enabled) {
        state.shuffle = enabled;
        if (shuffleButton instanceof HTMLElement) {
            shuffleButton.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        }
    }

    function updateDurationDisplay(index, duration) {
        const item = trackItems.find((element) => Number.parseInt(element.dataset.trackIndex || '-1', 10) === index);
        if (!item) {
            return;
        }
        const target = item.querySelector('[data-duration]');
        if (target) {
            target.textContent = formatTime(duration);
        }
    }

    function loadTrack(index, autoPlay = false, pushHistory = true) {
        if (!Number.isInteger(index) || index < 0 || index >= tracks.length) {
            return;
        }
        if (!state.queue.includes(index)) {
            return;
        }
        if (pushHistory && state.currentIndex !== -1 && state.currentIndex !== index) {
            state.history.push(state.currentIndex);
            if (state.history.length > 50) {
                state.history.shift();
            }
        }
        state.currentIndex = index;
        const track = tracks[index];
        audio.src = track.audioUrl;
        audio.load();
        updateCurrentInfo(track);
        highlightActiveTrack();
        if (autoPlay) {
            audio.play().catch(() => {
                updatePlayButton(false);
            });
        }
    }

    function playNext(autoPlay = true) {
        if (!state.queue.length) {
            return;
        }
        if (state.currentIndex === -1) {
            loadTrack(state.queue[0], autoPlay, true);
            return;
        }
        let nextIndex = state.currentIndex;
        if (state.shuffle) {
            const candidates = state.queue.filter((value) => value !== state.currentIndex);
            if (candidates.length === 0) {
                nextIndex = state.currentIndex;
            } else {
                nextIndex = candidates[Math.floor(Math.random() * candidates.length)];
            }
        } else {
            const position = state.queue.indexOf(state.currentIndex);
            if (position === -1 || position === state.queue.length - 1) {
                nextIndex = state.queue[0];
            } else {
                nextIndex = state.queue[position + 1];
            }
        }
        loadTrack(nextIndex, autoPlay, true);
    }

    function playPrevious() {
        if (!state.queue.length) {
            return;
        }
        if (state.shuffle && state.history.length) {
            const previousIndex = state.history.pop();
            loadTrack(previousIndex, true, false);
            return;
        }
        if (state.currentIndex === -1) {
            loadTrack(state.queue[0], false, false);
            return;
        }
        const position = state.queue.indexOf(state.currentIndex);
        let previousIndex;
        if (position <= 0) {
            previousIndex = state.queue[state.queue.length - 1];
        } else {
            previousIndex = state.queue[position - 1];
        }
        loadTrack(previousIndex, true, false);
    }

    function togglePlay() {
        if (state.currentIndex === -1 && state.queue.length) {
            loadTrack(state.queue[0], true, false);
            return;
        }
        if (audio.paused) {
            audio.play().catch(() => {
                updatePlayButton(false);
            });
        } else {
            audio.pause();
        }
    }

    function preloadDurations() {
        tracks.forEach((track, index) => {
            if (typeof track.duration === 'number' && track.duration > 0) {
                updateDurationDisplay(index, track.duration);
                return;
            }
            const probe = new Audio();
            probe.preload = 'metadata';
            probe.src = track.audioUrl;
            const cleanup = () => {
                probe.src = '';
            };
            probe.addEventListener('loadedmetadata', () => {
                const duration = Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0;
                if (duration > 0) {
                    tracks[index].duration = duration;
                    updateDurationDisplay(index, duration);
                    if (index === state.currentIndex && durationEl) {
                        durationEl.textContent = formatTime(duration);
                    }
                }
                cleanup();
            }, { once: true });
            probe.addEventListener('error', cleanup, { once: true });
        });
    }

    if (progressEl instanceof HTMLInputElement) {
        progressEl.addEventListener('input', (event) => {
            if (!audio.duration) {
                return;
            }
            const input = event.target;
            const percent = Number.parseFloat(input.value || '0');
            audio.currentTime = (Math.max(0, Math.min(100, percent)) / 100) * audio.duration;
        });
    }

    if (volumeEl instanceof HTMLInputElement) {
        const initialVolume = Number.parseFloat(volumeEl.value || '80') / 100;
        audio.volume = Math.max(0, Math.min(1, initialVolume));
        volumeEl.addEventListener('input', (event) => {
            const value = Number.parseFloat(event.target.value || '0');
            audio.volume = Math.max(0, Math.min(1, value / 100));
        });
    }

    if (playButton instanceof HTMLElement) {
        playButton.addEventListener('click', togglePlay);
    }
    if (nextButton instanceof HTMLElement) {
        nextButton.addEventListener('click', () => playNext(true));
    }
    if (prevButton instanceof HTMLElement) {
        prevButton.addEventListener('click', playPrevious);
    }
    if (shuffleButton instanceof HTMLElement) {
        shuffleButton.addEventListener('click', () => {
            setShuffle(!state.shuffle);
        });
    }

    trackItems.forEach((item) => {
        if (!(item instanceof HTMLElement)) {
            return;
        }
        item.addEventListener('click', () => {
            const index = Number.parseInt(item.dataset.trackIndex || '-1', 10);
            if (!Number.isInteger(index)) {
                return;
            }
            if (!state.queue.includes(index)) {
                return;
            }
            const shouldAutoplay = state.currentIndex === index ? audio.paused : true;
            loadTrack(index, shouldAutoplay, true);
        });
    });

    filterButtons.forEach((button) => {
        if (!(button instanceof HTMLElement)) {
            return;
        }
        const group = button.dataset.filterGroup;
        if (!group) {
            return;
        }
        button.addEventListener('click', () => {
            filterButtons
                .filter((element) => element.dataset.filterGroup === group)
                .forEach((element) => element.classList.remove('active'));
            button.classList.add('active');
            applyFilters(group, button.dataset.filterValue || '');
        });
    });

    audio.addEventListener('play', () => updatePlayButton(true));
    audio.addEventListener('pause', () => updatePlayButton(false));
    audio.addEventListener('timeupdate', () => {
        if (!audio.duration) {
            return;
        }
        if (currentTimeEl) {
            currentTimeEl.textContent = formatTime(audio.currentTime);
        }
        if (progressEl instanceof HTMLInputElement) {
            const percent = (audio.currentTime / audio.duration) * 100;
            progressEl.value = String(Math.min(100, Math.max(0, percent)));
        }
    });
    audio.addEventListener('loadedmetadata', () => {
        if (!Number.isFinite(audio.duration) || audio.duration <= 0) {
            return;
        }
        const rounded = Math.round(audio.duration);
        if (state.currentIndex >= 0 && state.currentIndex < tracks.length) {
            tracks[state.currentIndex].duration = rounded;
        }
        if (durationEl) {
            durationEl.textContent = formatTime(audio.duration);
        }
        if (progressEl instanceof HTMLInputElement) {
            progressEl.value = '0';
        }
    });
    audio.addEventListener('ended', () => playNext(true));
    audio.addEventListener('error', () => {
        updatePlayButton(false);
    });

    refreshQueue();
    if (state.queue.length) {
        loadTrack(state.queue[0], false, false);
    } else {
        resetCurrentInfo();
    }
    preloadDurations();
})();
