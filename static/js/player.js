// ==========================================
// MKV Video Player - Complete JavaScript
// ==========================================

class VideoPlayer {
    constructor() {
        this.initElements();
        this.initState();
        this.bindEvents();
        this.loadPreferences();
        this.checkFFmpeg();
    }

    // ==========================================
    // Initialize DOM Elements
    // ==========================================
    initElements() {
        // Video elements
        this.video = document.getElementById('videoPlayer');
        this.playerWrapper = document.getElementById('playerWrapper');
        this.videoPlaceholder = document.getElementById('videoPlaceholder');
        this.loadingOverlay = document.getElementById('loadingOverlay');
        this.loadingText = document.getElementById('loadingText');

        // Progress elements
        this.progressContainer = document.getElementById('progressContainer');
        this.progressBar = document.getElementById('progressBar');
        this.progressBuffer = document.getElementById('progressBuffer');
        this.progressHandle = document.getElementById('progressHandle');
        this.timeTooltip = document.getElementById('timeTooltip');

        // Control buttons
        this.playPauseBtn = document.getElementById('playPauseBtn');
        this.playPauseIcon = document.getElementById('playPauseIcon');
        this.bigPlayBtn = document.getElementById('bigPlayBtn');
        this.bigPlayOverlay = document.getElementById('bigPlayOverlay');
        this.playIndicator = document.getElementById('playIndicator');
        this.playIndicatorIcon = document.getElementById('playIndicatorIcon');
        this.skipBackBtn = document.getElementById('skipBackBtn');
        this.skipForwardBtn = document.getElementById('skipForwardBtn');
        this.volumeBtn = document.getElementById('volumeBtn');
        this.volumeIcon = document.getElementById('volumeIcon');
        this.volumeSlider = document.getElementById('volumeSlider');
        this.fullscreenBtn = document.getElementById('fullscreenBtn');
        this.fullscreenIcon = document.getElementById('fullscreenIcon');

        // Time display
        this.currentTimeEl = document.getElementById('currentTime');
        this.durationEl = document.getElementById('duration');

        // Dropdowns
        this.audioBtn = document.getElementById('audioBtn');
        this.audioMenu = document.getElementById('audioMenu');
        this.audioMenuItems = document.getElementById('audioMenuItems');
        this.audioBadge = document.getElementById('audioBadge');

        this.subtitleBtn = document.getElementById('subtitleBtn');
        this.subtitleMenu = document.getElementById('subtitleMenu');
        this.subtitleMenuItems = document.getElementById('subtitleMenuItems');
        this.subtitleBadge = document.getElementById('subtitleBadge');
        this.subtitlesContainer = document.getElementById('subtitlesContainer');
        this.subtitleText = document.getElementById('subtitleText');

        this.speedBtn = document.getElementById('speedBtn');
        this.speedMenu = document.getElementById('speedMenu');

        // Sidebar
        this.trackSidebar = document.getElementById('trackSidebar');
        this.videoInfoSection = document.getElementById('videoInfoSection');
        this.videoInfoCard = document.getElementById('videoInfoCard');
        this.audioTrackList = document.getElementById('audioTrackList');
        this.subtitleTrackList = document.getElementById('subtitleTrackList');

        // Input elements
        this.videoUrlInput = document.getElementById('videoUrl');
        this.loadBtn = document.getElementById('loadBtn');
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.themeToggle = document.getElementById('themeToggle');

        // Status
        this.ffmpegStatus = document.getElementById('ffmpegStatus');
    }

    // ==========================================
    // Initialize State
    // ==========================================
    initState() {
        this.isPlaying = false;
        this.isMuted = false;
        this.isFullscreen = false;
        this.isDragging = false;
        this.controlsTimeout = null;
        this.currentVideoUrl = '';

        // Track data
        this.videoInfo = null;
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.currentAudioIndex = -1;
        this.currentSubtitleIndex = -1;
        this.subtitlesEnabled = false;
        this.subtitleCues = [];

        // FFmpeg status
        this.ffmpegAvailable = false;
        this.ffprobeAvailable = false;
    }

    // ==========================================
    // Load User Preferences
    // ==========================================
    loadPreferences() {
        // Volume
        const savedVolume = localStorage.getItem('playerVolume');
        if (savedVolume !== null) {
            this.video.volume = parseFloat(savedVolume);
            this.volumeSlider.value = this.video.volume;
        }
        this.updateVolumeIcon();

        // Theme
        const savedTheme = localStorage.getItem('playerTheme');
        if (savedTheme === 'light') {
            document.body.classList.add('light-theme');
            this.updateThemeButton(true);
        }
    }

    // ==========================================
    // Check FFmpeg Availability
    // ==========================================
    async checkFFmpeg() {
        try {
            const response = await fetch('/api/health');
            const data = await response.json();
            
            this.ffmpegAvailable = data.ffmpeg;
            this.ffprobeAvailable = data.ffprobe;
            
            this.updateFFmpegStatus();
        } catch (e) {
            this.ffmpegAvailable = false;
            this.ffprobeAvailable = false;
            this.updateFFmpegStatus();
        }
    }

    updateFFmpegStatus() {
        const statusDot = this.ffmpegStatus.querySelector('.status-dot');
        const statusText = this.ffmpegStatus.querySelector('span:last-child');
        
        this.ffmpegStatus.classList.remove('success', 'error', 'warning');
        
        if (this.ffmpegAvailable && this.ffprobeAvailable) {
            this.ffmpegStatus.classList.add('success');
            statusText.textContent = 'FFmpeg Ready';
        } else if (this.ffmpegAvailable || this.ffprobeAvailable) {
            this.ffmpegStatus.classList.add('warning');
            statusText.textContent = 'Partial FFmpeg';
            showMessage('warning', 'FFmpeg partially installed. Some features may not work.');
        } else {
            this.ffmpegStatus.classList.add('error');
            statusText.textContent = 'No FFmpeg';
            showMessage('warning', 'FFmpeg not installed. Audio/subtitle switching disabled.');
        }
    }

    // ==========================================
    // Bind Events
    // ==========================================
    bindEvents() {
        // Video events
        this.video.addEventListener('play', () => this.onPlay());
        this.video.addEventListener('pause', () => this.onPause());
        this.video.addEventListener('timeupdate', () => this.onTimeUpdate());
        this.video.addEventListener('loadedmetadata', () => this.onLoadedMetadata());
        this.video.addEventListener('waiting', () => this.showLoading('Buffering...'));
        this.video.addEventListener('canplay', () => this.hideLoading());
        this.video.addEventListener('canplaythrough', () => this.hideLoading());
        this.video.addEventListener('progress', () => this.updateBufferProgress());
        this.video.addEventListener('ended', () => this.onEnded());
        this.video.addEventListener('error', (e) => this.onError(e));
        this.video.addEventListener('volumechange', () => this.onVolumeChange());

        // Play/Pause buttons
        this.playPauseBtn.addEventListener('click', () => this.togglePlay());
        this.bigPlayBtn.addEventListener('click', () => this.togglePlay());
        this.bigPlayOverlay.addEventListener('click', (e) => {
            if (e.target === this.bigPlayOverlay) this.togglePlay();
        });
        this.video.addEventListener('click', () => this.togglePlay());

        // Skip buttons
        this.skipBackBtn.addEventListener('click', () => this.skip(-10));
        this.skipForwardBtn.addEventListener('click', () => this.skip(10));

        // Volume
        this.volumeBtn.addEventListener('click', () => this.toggleMute());
        this.volumeSlider.addEventListener('input', (e) => this.setVolume(e.target.value));

        // Fullscreen
        this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());

        // Progress bar
        this.progressContainer.addEventListener('click', (e) => this.seek(e));
        this.progressContainer.addEventListener('mousemove', (e) => this.showTimeTooltip(e));
        this.progressContainer.addEventListener('mousedown', (e) => this.startDragging(e));
        document.addEventListener('mousemove', (e) => this.onDrag(e));
        document.addEventListener('mouseup', () => this.stopDragging());

        // Dropdowns
        this.audioBtn.addEventListener('click', (e) => this.toggleDropdown(e, 'audioMenu'));
        this.subtitleBtn.addEventListener('click', (e) => this.toggleDropdown(e, 'subtitleMenu'));
        this.speedBtn.addEventListener('click', (e) => this.toggleDropdown(e, 'speedMenu'));

        // Speed menu items
        document.querySelectorAll('#speedMenu .dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                this.setPlaybackSpeed(parseFloat(item.dataset.speed));
                this.closeAllDropdowns();
            });
        });

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.dropdown')) {
                this.closeAllDropdowns();
            }
        });

        // Input handlers
        this.loadBtn.addEventListener('click', () => this.loadVideo());
        this.analyzeBtn.addEventListener('click', () => this.analyzeVideo());
        this.videoUrlInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.loadVideo();
        });

        // Theme toggle
        this.themeToggle.addEventListener('click', () => this.toggleTheme());

        // Controls visibility
        this.playerWrapper.addEventListener('mousemove', () => this.showControls());
        this.playerWrapper.addEventListener('mouseleave', () => this.hideControlsDelayed());
        this.playerWrapper.addEventListener('touchstart', () => this.showControls());

        // Keyboard
        document.addEventListener('keydown', (e) => this.handleKeydown(e));

        // Fullscreen change
        document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
        document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
    }

    // ==========================================
    // Dropdown Management
    // ==========================================
    toggleDropdown(e, menuId) {
        e.stopPropagation();
        const menu = document.getElementById(menuId);
        const isVisible = menu.classList.contains('visible');
        
        this.closeAllDropdowns();
        
        if (!isVisible) {
            menu.classList.add('visible');
        }
    }

    closeAllDropdowns() {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.remove('visible');
        });
    }

    // ==========================================
    // Video Loading
    // ==========================================
    loadVideo() {
        const url = this.videoUrlInput.value.trim();
        
        if (!url) {
            showMessage('error', 'Please enter a video URL');
            return;
        }

        try {
            new URL(url);
        } catch {
            showMessage('error', 'Invalid URL format');
            return;
        }

        hideAllMessages();
        this.showLoading('Loading video...');
        this.videoPlaceholder.style.display = 'none';
        this.currentVideoUrl = url;

        // Reset tracks
        this.audioTracks = [];
        this.subtitleTracks = [];
        this.currentAudioIndex = -1;
        this.currentSubtitleIndex = -1;
        this.subtitleCues = [];
        this.hideSubtitle();

        // Load via proxy
        const proxyUrl = `/api/video?url=${encodeURIComponent(url)}`;
        this.video.src = proxyUrl;
        this.video.load();
    }

    // ==========================================
    // Video Analysis (FFprobe)
    // ==========================================
    async analyzeVideo() {
        const url = this.videoUrlInput.value.trim();
        
        if (!url) {
            showMessage('error', 'Please enter a video URL first');
            return;
        }

        try {
            new URL(url);
        } catch {
            showMessage('error', 'Invalid URL format');
            return;
        }

        if (!this.ffprobeAvailable) {
            showMessage('error', 'FFprobe not available. Cannot analyze video.');
            return;
        }

        hideAllMessages();
        this.showLoading('Analyzing video tracks...');
        this.currentVideoUrl = url;

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: url })
            });

            const data = await response.json();

            if (data.error) {
                this.hideLoading();
                showMessage('error', data.error);
                return;
            }

            // Store track info
            this.videoInfo = data.video_info;
            this.audioTracks = data.audio_streams || [];
            this.subtitleTracks = data.subtitle_streams || [];

            // Update UI
            this.updateVideoInfo();
            this.updateAudioTracksUI();
            this.updateSubtitleTracksUI();
            this.updateControlBadges();

            this.hideLoading();
            
            const trackCount = this.audioTracks.length + this.subtitleTracks.length;
            showMessage('success', `Found ${this.audioTracks.length} audio tracks and ${this.subtitleTracks.length} subtitle tracks`);

        } catch (e) {
            this.hideLoading();
            showMessage('error', 'Failed to analyze video: ' + e.message);
        }
    }

    // ==========================================
    // Update Video Info Display
    // ==========================================
    updateVideoInfo() {
        if (!this.videoInfo) return;

        this.videoInfoSection.style.display = 'block';
        
        this.videoInfoCard.innerHTML = `
            <div class="video-info-row">
                <span class="video-info-label">Format</span>
                <span class="video-info-value">${this.videoInfo.format || 'Unknown'}</span>
            </div>
            <div class="video-info-row">
                <span class="video-info-label">Duration</span>
                <span class="video-info-value">${this.videoInfo.duration || 'Unknown'}</span>
            </div>
            <div class="video-info-row">
                <span class="video-info-label">Size</span>
                <span class="video-info-value">${this.videoInfo.size || 'Unknown'}</span>
            </div>
            <div class="video-info-row">
                <span class="video-info-label">Bitrate</span>
                <span class="video-info-value">${this.videoInfo.bitrate || 'Unknown'}</span>
            </div>
        `;
    }

    // ==========================================
    // Update Audio Tracks UI
    // ==========================================
    updateAudioTracksUI() {
        if (this.audioTracks.length === 0) {
            this.audioTrackList.innerHTML = `
                <div class="no-tracks-message">
                    <div class="icon">🔇</div>
                    <p>No audio tracks found</p>
                </div>
            `;
            this.audioMenuItems.innerHTML = '<div class="no-tracks">No audio tracks</div>';
            return;
        }

        // Update sidebar
        this.audioTrackList.innerHTML = this.audioTracks.map((track, i) => `
            <div class="track-item ${i === 0 ? 'active' : ''}" data-audio-index="${track.index}" data-list-index="${i}">
                <div class="track-icon">🔊</div>
                <div class="track-details">
                    <div class="track-name">${track.title || 'Audio Track ' + (i + 1)}</div>
                    <div class="track-meta">${track.language.toUpperCase()} • ${track.codec} • ${track.channels}ch</div>
                </div>
                ${track.default ? '<span class="track-badge default">Default</span>' : ''}
            </div>
        `).join('');

        // Update dropdown menu
        this.audioMenuItems.innerHTML = this.audioTracks.map((track, i) => `
            <div class="dropdown-item ${i === 0 ? 'active' : ''}" data-audio-index="${track.index}" data-list-index="${i}">
                <div class="track-info">
                    <div class="track-title">${track.title || 'Track ' + (i + 1)}</div>
                    <div class="track-meta">${track.language.toUpperCase()} • ${track.codec} • ${track.channels}ch</div>
                </div>
                <svg class="check-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
            </div>
        `).join('');

        // Bind click events - Sidebar
        this.audioTrackList.querySelectorAll('.track-item').forEach(item => {
            item.addEventListener('click', () => {
                const streamIndex = parseInt(item.dataset.audioIndex);
                const listIndex = parseInt(item.dataset.listIndex);
                this.selectAudioTrack(streamIndex, listIndex);
            });
        });

        // Bind click events - Dropdown
        this.audioMenuItems.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const streamIndex = parseInt(item.dataset.audioIndex);
                const listIndex = parseInt(item.dataset.listIndex);
                this.selectAudioTrack(streamIndex, listIndex);
                this.closeAllDropdowns();
            });
        });

        // Set default
        if (this.audioTracks.length > 0) {
            this.currentAudioIndex = this.audioTracks[0].index;
        }
    }

    // ==========================================
    // Update Subtitle Tracks UI
    // ==========================================
    updateSubtitleTracksUI() {
        // Always include "Off" option
        let sidebarHtml = `
            <div class="track-item active" data-subtitle-index="-1">
                <div class="track-icon">🚫</div>
                <div class="track-details">
                    <div class="track-name">Off</div>
                    <div class="track-meta">Disable subtitles</div>
                </div>
            </div>
        `;

        let menuHtml = `
            <div class="dropdown-item active" data-subtitle-index="-1">
                <div class="track-info">
                    <div class="track-title">Off</div>
                </div>
                <svg class="check-icon" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
            </div>
        `;

        if (this.subtitleTracks.length === 0) {
            this.subtitleTrackList.innerHTML = sidebarHtml + `
                <div class="no-tracks-message" style="margin-top: 0.5rem;">
                    <p style="font-size: 0.85rem; color: var(--text-muted);">No embedded subtitles found</p>
                </div>
            `;
            this.subtitleMenuItems.innerHTML = menuHtml;
        } else {
            // Add subtitle tracks
            sidebarHtml += this.subtitleTracks.map((track, i) => `
                <div class="track-item" data-subtitle-index="${track.index}" data-list-index="${i}">
                    <div class="track-icon">💬</div>
                    <div class="track-details">
                        <div class="track-name">${track.title || 'Subtitle ' + (i + 1)}</div>
                        <div class="track-meta">${track.language.toUpperCase()} • ${track.codec}</div>
                    </div>
                    ${track.default ? '<span class="track-badge default">Default</span>' : ''}
                    ${track.forced ? '<span class="track-badge">Forced</span>' : ''}
                </div>
            `).join('');

            menuHtml += '<div class="dropdown-divider"></div>' + this.subtitleTracks.map((track, i) => `
                <div class="dropdown-item" data-subtitle-index="${track.index}" data-list-index="${i}">
                    <div class="track-info">
                        <div class="track-title">${track.title || 'Subtitle ' + (i + 1)}</div>
                        <div class="track-meta">${track.language.toUpperCase()} • ${track.codec}</div>
                    </div>
                    <svg class="check-icon" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                    </svg>
                </div>
            `).join('');

            this.subtitleTrackList.innerHTML = sidebarHtml;
            this.subtitleMenuItems.innerHTML = menuHtml;
        }

        // Bind click events - Sidebar
        this.subtitleTrackList.querySelectorAll('.track-item').forEach(item => {
            item.addEventListener('click', () => {
                const streamIndex = parseInt(item.dataset.subtitleIndex);
                this.selectSubtitleTrack(streamIndex);
            });
        });

        // Bind click events - Dropdown
        this.subtitleMenuItems.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => {
                const streamIndex = parseInt(item.dataset.subtitleIndex);
                this.selectSubtitleTrack(streamIndex);
                this.closeAllDropdowns();
            });
        });
    }

    // ==========================================
    // Update Control Badges
    // ==========================================
    updateControlBadges() {
        // Audio badge
        if (this.audioTracks.length > 0) {
            this.audioBadge.textContent = this.audioTracks.length;
            this.audioBadge.style.display = 'flex';
        } else {
            this.audioBadge.style.display = 'none';
        }

        // Subtitle badge
        if (this.subtitleTracks.length > 0) {
            this.subtitleBadge.textContent = this.subtitleTracks.length;
            this.subtitleBadge.style.display = 'flex';
        } else {
            this.subtitleBadge.style.display = 'none';
        }
    }

    // ==========================================
    // Select Audio Track
    // ==========================================
    async selectAudioTrack(streamIndex, listIndex) {
        if (streamIndex === this.currentAudioIndex) return;
        
        if (!this.ffmpegAvailable) {
            showMessage('error', 'FFmpeg required for audio switching');
            return;
        }

        this.showLoading('Switching audio track...');

        // Update UI
        this.audioTrackList.querySelectorAll('.track-item').forEach((item, i) => {
            item.classList.toggle('active', i === listIndex);
        });
        this.audioMenuItems.querySelectorAll('.dropdown-item').forEach((item, i) => {
            item.classList.toggle('active', i === listIndex);
        });

        // Store current time
        const currentTime = this.video.currentTime;
        const wasPlaying = !this.video.paused;

        // Load new stream with selected audio
        this.currentAudioIndex = streamIndex;
        const streamUrl = `/api/stream?url=${encodeURIComponent(this.currentVideoUrl)}&audio=${streamIndex}`;
        
        this.video.src = streamUrl;
        
        this.video.addEventListener('loadedmetadata', () => {
            this.video.currentTime = currentTime;
            if (wasPlaying) {
                this.video.play().catch(() => {});
            }
            this.hideLoading();
            showMessage('success', `Switched to audio track ${listIndex + 1}`);
        }, { once: true });

        this.video.load();
    }

    // ==========================================
    // Select Subtitle Track
    // ==========================================
    async selectSubtitleTrack(streamIndex) {
        // Update UI - Sidebar
        this.subtitleTrackList.querySelectorAll('.track-item').forEach(item => {
            const idx = parseInt(item.dataset.subtitleIndex);
            item.classList.toggle('active', idx === streamIndex);
        });

        // Update UI - Dropdown
        this.subtitleMenuItems.querySelectorAll('.dropdown-item').forEach(item => {
            const idx = parseInt(item.dataset.subtitleIndex);
            item.classList.toggle('active', idx === streamIndex);
        });

        // Disable subtitles
        if (streamIndex === -1) {
            this.currentSubtitleIndex = -1;
            this.subtitlesEnabled = false;
            this.subtitleCues = [];
            this.hideSubtitle();
            this.subtitleBtn.classList.remove('active');
            return;
        }

        if (!this.ffmpegAvailable) {
            showMessage('error', 'FFmpeg required for subtitle extraction');
            return;
        }

        this.showLoading('Loading subtitles...');

        try {
            // Fetch subtitle as VTT
            const response = await fetch(`/api/subtitle?url=${encodeURIComponent(this.currentVideoUrl)}&index=${streamIndex}`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch subtitle');
            }

            const vttText = await response.text();
            this.subtitleCues = this.parseVTT(vttText);
            
            this.currentSubtitleIndex = streamIndex;
            this.subtitlesEnabled = true;
            this.subtitleBtn.classList.add('active');

            this.hideLoading();
            showMessage('success', `Loaded ${this.subtitleCues.length} subtitle cues`);

        } catch (e) {
            this.hideLoading();
            showMessage('error', 'Failed to load subtitles: ' + e.message);
        }
    }

    // ==========================================
    // Parse VTT Subtitles
    // ==========================================
    parseVTT(vttText) {
        const cues = [];
        const lines = vttText.split('\n');
        let i = 0;

        // Skip header
        while (i < lines.length && !lines[i].includes('-->')) {
            i++;
        }

        while (i < lines.length) {
            const line = lines[i].trim();
            
            if (line.includes('-->')) {
                const timeParts = line.split('-->');
                const startTime = this.parseVTTTime(timeParts[0].trim());
                const endTime = this.parseVTTTime(timeParts[1].trim().split(' ')[0]);

                // Get text lines
                let text = '';
                i++;
                while (i < lines.length && lines[i].trim() !== '') {
                    text += (text ? '\n' : '') + lines[i].trim();
                    i++;
                }

                if (text) {
                    cues.push({
                        start: startTime,
                        end: endTime,
                        text: text.replace(/<[^>]*>/g, '') // Remove HTML tags
                    });
                }
            }
            i++;
        }

        return cues;
    }

    parseVTTTime(timeStr) {
        const parts = timeStr.split(':');
        let seconds = 0;

        if (parts.length === 3) {
            // HH:MM:SS.mmm
            seconds = parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2].replace(',', '.'));
        } else if (parts.length === 2) {
            // MM:SS.mmm
            seconds = parseFloat(parts[0]) * 60 + parseFloat(parts[1].replace(',', '.'));
        }

        return seconds;
    }

    // ==========================================
    // Display Subtitle
    // ==========================================
    updateSubtitle() {
        if (!this.subtitlesEnabled || this.subtitleCues.length === 0) {
            this.hideSubtitle();
            return;
        }

        const currentTime = this.video.currentTime;
        let foundCue = null;

        for (const cue of this.subtitleCues) {
            if (currentTime >= cue.start && currentTime <= cue.end) {
                foundCue = cue;
                break;
            }
        }

        if (foundCue) {
            this.subtitleText.textContent = foundCue.text;
            this.subtitleText.style.display = 'inline-block';
        } else {
            this.hideSubtitle();
        }
    }

    hideSubtitle() {
        this.subtitleText.style.display = 'none';
        this.subtitleText.textContent = '';
    }

    // ==========================================
    // Playback Controls
    // ==========================================
    togglePlay() {
        if (this.video.paused) {
            this.video.play().catch(e => {
                showMessage('error', 'Failed to play: ' + e.message);
            });
        } else {
            this.video.pause();
        }
        this.showPlayIndicator();
    }

    onPlay() {
        this.isPlaying = true;
        this.updatePlayPauseIcon();
        this.playerWrapper.classList.remove('paused');
    }

    onPause() {
        this.isPlaying = false;
        this.updatePlayPauseIcon();
        this.playerWrapper.classList.add('paused');
    }

    updatePlayPauseIcon() {
        const playPath = 'M8 5v14l11-7z';
        const pausePath = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
        
        this.playPauseIcon.innerHTML = `<path d="${this.isPlaying ? pausePath : playPath}"/>`;
    }

    showPlayIndicator() {
        const playPath = 'M8 5v14l11-7z';
        const pausePath = 'M6 19h4V5H6v14zm8-14v14h4V5h-4z';
        
        this.playIndicatorIcon.innerHTML = `<path d="${this.isPlaying ? pausePath : playPath}"/>`;
        this.playIndicator.classList.remove('animate');
        void this.playIndicator.offsetWidth;
        this.playIndicator.classList.add('animate');
    }

    skip(seconds) {
        if (!isNaN(this.video.duration)) {
            this.video.currentTime = Math.max(0, Math.min(this.video.duration, this.video.currentTime + seconds));
        }
    }

    // ==========================================
    // Progress Bar
    // ==========================================
    onTimeUpdate() {
        if (!this.isDragging && !isNaN(this.video.duration)) {
            const progress = (this.video.currentTime / this.video.duration) * 100;
            this.progressBar.style.width = `${progress}%`;
            this.progressHandle.style.left = `${progress}%`;
            this.currentTimeEl.textContent = this.formatTime(this.video.currentTime);
        }

        // Update subtitles
        this.updateSubtitle();
    }

    onLoadedMetadata() {
        this.hideLoading();
        this.durationEl.textContent = this.formatTime(this.video.duration);
        this.playerWrapper.classList.add('paused');
    }

    updateBufferProgress() {
        if (this.video.buffered.length > 0) {
            const bufferedEnd = this.video.buffered.end(this.video.buffered.length - 1);
            const bufferProgress = (bufferedEnd / this.video.duration) * 100;
            this.progressBuffer.style.width = `${bufferProgress}%`;
        }
    }

    seek(e) {
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        this.video.currentTime = pos * this.video.duration;
    }

    startDragging(e) {
        this.isDragging = true;
        this.seek(e);
    }

    onDrag(e) {
        if (!this.isDragging) return;
        
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        this.progressBar.style.width = `${pos * 100}%`;
        this.progressHandle.style.left = `${pos * 100}%`;
        this.video.currentTime = pos * this.video.duration;
    }

    stopDragging() {
        this.isDragging = false;
    }

    showTimeTooltip(e) {
        if (isNaN(this.video.duration)) return;
        
        const rect = this.progressContainer.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const time = pos * this.video.duration;
        
        this.timeTooltip.textContent = this.formatTime(time);
        this.timeTooltip.style.left = `${pos * 100}%`;
    }

    // ==========================================
    // Volume Controls
    // ==========================================
    setVolume(value) {
        this.video.volume = parseFloat(value);
        this.video.muted = false;
        this.isMuted = false;
        localStorage.setItem('playerVolume', value);
        this.updateVolumeIcon();
    }

    toggleMute() {
        this.isMuted = !this.video.muted;
        this.video.muted = this.isMuted;
        this.updateVolumeIcon();
    }

    onVolumeChange() {
        this.volumeSlider.value = this.video.muted ? 0 : this.video.volume;
        this.updateVolumeIcon();
    }

    updateVolumeIcon() {
        let path;
        
        if (this.video.muted || this.video.volume === 0) {
            path = 'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z';
        } else if (this.video.volume < 0.5) {
            path = 'M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z';
        } else {
            path = 'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z';
        }
        
        this.volumeIcon.innerHTML = `<path d="${path}"/>`;
    }

    // ==========================================
    // Fullscreen
    // ==========================================
    toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            if (this.playerWrapper.requestFullscreen) {
                this.playerWrapper.requestFullscreen();
            } else if (this.playerWrapper.webkitRequestFullscreen) {
                this.playerWrapper.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }

    onFullscreenChange() {
        this.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        this.updateFullscreenIcon();
    }

    updateFullscreenIcon() {
        const enterPath = 'M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z';
        const exitPath = 'M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z';
        
        this.fullscreenIcon.innerHTML = `<path d="${this.isFullscreen ? exitPath : enterPath}"/>`;
    }

    // ==========================================
    // Playback Speed
    // ==========================================
    setPlaybackSpeed(speed) {
        this.video.playbackRate = speed;
        
        document.querySelectorAll('#speedMenu .dropdown-item').forEach(item => {
            item.classList.toggle('active', parseFloat(item.dataset.speed) === speed);
        });
    }

    // ==========================================
    // Controls Visibility
    // ==========================================
    showControls() {
        this.playerWrapper.classList.add('controls-visible');
        clearTimeout(this.controlsTimeout);
        this.hideControlsDelayed();
    }

    hideControlsDelayed() {
        clearTimeout(this.controlsTimeout);
        this.controlsTimeout = setTimeout(() => {
            if (this.isPlaying && !this.isDragging) {
                this.playerWrapper.classList.remove('controls-visible');
            }
        }, 3000);
    }

    // ==========================================
    // Loading States
    // ==========================================
    showLoading(text = 'Loading...') {
        this.loadingText.textContent = text;
        this.loadingOverlay.classList.add('visible');
    }

    hideLoading() {
        this.loadingOverlay.classList.remove('visible');
    }

    // ==========================================
    // Error Handling
    // ==========================================
    onError(e) {
        this.hideLoading();
        
        const error = this.video.error;
        let message = 'Failed to load video';
        
        if (error) {
            switch (error.code) {
                case MediaError.MEDIA_ERR_ABORTED:
                    message = 'Video loading aborted';
                    break;
                case MediaError.MEDIA_ERR_NETWORK:
                    message = 'Network error while loading video';
                    break;
                case MediaError.MEDIA_ERR_DECODE:
                    message = 'Video format not supported or corrupted';
                    break;
                case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
                    message = 'Video source not supported';
                    break;
            }
        }
        
        showMessage('error', message);
    }

    onEnded() {
        this.isPlaying = false;
        this.updatePlayPauseIcon();
        this.playerWrapper.classList.add('paused');
    }

    // ==========================================
    // Theme
    // ==========================================
    toggleTheme() {
        const isLight = document.body.classList.toggle('light-theme');
        localStorage.setItem('playerTheme', isLight ? 'light' : 'dark');
        this.updateThemeButton(isLight);
    }

    updateThemeButton(isLight) {
        const icon = this.themeToggle.querySelector('.theme-icon');
        const text = this.themeToggle.querySelector('span:last-child');
        
        icon.textContent = isLight ? '☀️' : '🌙';
        text.textContent = isLight ? 'Light' : 'Dark';
    }

    // ==========================================
    // Keyboard Controls
    // ==========================================
    handleKeydown(e) {
        // Don't handle if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.key.toLowerCase()) {
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'arrowleft':
                e.preventDefault();
                this.skip(-10);
                break;
            case 'arrowright':
                e.preventDefault();
                this.skip(10);
                break;
            case 'arrowup':
                e.preventDefault();
                this.setVolume(Math.min(1, this.video.volume + 0.1));
                break;
            case 'arrowdown':
                e.preventDefault();
                this.setVolume(Math.max(0, this.video.volume - 0.1));
                break;
            case 'f':
                e.preventDefault();
                this.toggleFullscreen();
                break;
            case 'm':
                e.preventDefault();
                this.toggleMute();
                break;
            case 'c':
                e.preventDefault();
                // Toggle subtitles on/off
                if (this.subtitlesEnabled) {
                    this.selectSubtitleTrack(-1);
                } else if (this.subtitleTracks.length > 0) {
                    this.selectSubtitleTrack(this.subtitleTracks[0].index);
                }
                break;
            case 'escape':
                if (this.isFullscreen) {
                    this.toggleFullscreen();
                }
                break;
        }
    }

    // ==========================================
    // Utility Functions
    // ==========================================
    formatTime(seconds) {
        if (isNaN(seconds) || !isFinite(seconds)) return '0:00';
        
        const hours = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
}


// ==========================================
// Message Functions
// ==========================================
function showMessage(type, text) {
    hideAllMessages();
    
    const messageEl = document.getElementById(`${type}Message`);
    const textEl = document.getElementById(`${type}Text`);
    
    if (messageEl && textEl) {
        textEl.textContent = text;
        messageEl.classList.add('visible');
        
        // Auto-hide after 5 seconds for success messages
        if (type === 'success') {
            setTimeout(() => hideMessage(type), 5000);
        }
    }
}

function hideMessage(type) {
    const messageEl = document.getElementById(`${type}Message`);
    if (messageEl) {
        messageEl.classList.remove('visible');
    }
}

function hideAllMessages() {
    ['error', 'warning', 'success'].forEach(type => hideMessage(type));
}


// ==========================================
// Initialize Player on DOM Ready
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    window.player = new VideoPlayer();
});