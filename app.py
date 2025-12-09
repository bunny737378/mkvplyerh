#!/usr/bin/env python3
"""
MKV Video Player - Flask Backend
Video Proxy + FFmpeg Audio/Subtitle Extraction
"""

import os
import re
import json
import socket
import subprocess
from urllib.parse import urlparse, unquote
from ipaddress import ip_address, ip_network
from flask import Flask, request, Response, render_template, jsonify, stream_with_context
import requests

app = Flask(__name__)
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'dev-secret-key')

# ============================================
# Configuration
# ============================================
CHUNK_SIZE = 8192
REQUEST_TIMEOUT = 30

BLOCKED_NETWORKS = [
    ip_network('127.0.0.0/8'),
    ip_network('10.0.0.0/8'),
    ip_network('172.16.0.0/12'),
    ip_network('192.168.0.0/16'),
    ip_network('169.254.0.0/16'),
    ip_network('::1/128'),
    ip_network('fc00::/7'),
    ip_network('fe80::/10'),
]

# ============================================
# Helper Functions
# ============================================

def is_private_ip(hostname: str) -> bool:
    """Check if hostname resolves to private IP."""
    try:
        try:
            ip = ip_address(hostname)
            return any(ip in network for network in BLOCKED_NETWORKS)
        except ValueError:
            pass
        ip_str = socket.gethostbyname(hostname)
        ip = ip_address(ip_str)
        return any(ip in network for network in BLOCKED_NETWORKS)
    except (socket.gaierror, socket.herror):
        return True


def validate_url(url: str) -> tuple:
    """Validate URL for security."""
    if not url:
        return False, "No URL provided"
    
    url = unquote(url)
    
    try:
        parsed = urlparse(url)
    except Exception:
        return False, "Invalid URL format"
    
    if parsed.scheme not in ('http', 'https'):
        return False, "Only HTTP/HTTPS allowed"
    
    if not parsed.hostname:
        return False, "Invalid hostname"
    
    if is_private_ip(parsed.hostname):
        return False, "Access to internal networks not allowed"
    
    blocked_hosts = ['localhost', 'localhost.localdomain', '0.0.0.0']
    if parsed.hostname.lower() in blocked_hosts:
        return False, "Access to localhost not allowed"
    
    return True, url


def check_ffmpeg() -> bool:
    """Check if FFmpeg is installed."""
    try:
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True)
        return True
    except:
        return False


def check_ffprobe() -> bool:
    """Check if FFprobe is installed."""
    try:
        subprocess.run(['ffprobe', '-version'], capture_output=True, check=True)
        return True
    except:
        return False


def get_media_info(url: str) -> dict:
    """Get media info using FFprobe."""
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        url
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        if result.returncode != 0:
            return None
        return json.loads(result.stdout)
    except Exception as e:
        print(f"FFprobe error: {e}")
        return None


def format_duration(seconds):
    """Format duration to HH:MM:SS."""
    if not seconds:
        return "Unknown"
    try:
        seconds = float(seconds)
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    except:
        return "Unknown"


def format_size(bytes_size):
    """Format file size."""
    if not bytes_size:
        return "Unknown"
    try:
        bytes_size = float(bytes_size)
        for unit in ['B', 'KB', 'MB', 'GB']:
            if bytes_size < 1024:
                return f"{bytes_size:.2f} {unit}"
            bytes_size /= 1024
        return f"{bytes_size:.2f} TB"
    except:
        return "Unknown"


def format_bitrate(bitrate):
    """Format bitrate."""
    if not bitrate:
        return "Unknown"
    try:
        bitrate = float(bitrate)
        if bitrate >= 1000000:
            return f"{bitrate/1000000:.2f} Mbps"
        elif bitrate >= 1000:
            return f"{bitrate/1000:.0f} Kbps"
        return f"{bitrate:.0f} bps"
    except:
        return "Unknown"


# ============================================
# Routes - Main
# ============================================

@app.route('/')
def index():
    """Render main page."""
    return render_template('index.html')


@app.route('/api/health')
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'ffmpeg': check_ffmpeg(),
        'ffprobe': check_ffprobe()
    })


# ============================================
# Routes - Video Proxy
# ============================================

@app.route('/api/video')
def proxy_video():
    """Proxy video content with Range support."""
    video_url = request.args.get('url', '')
    
    is_valid, result = validate_url(video_url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    video_url = result
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'identity',
            'Connection': 'keep-alive',
        }
        
        range_header = request.headers.get('Range')
        if range_header:
            headers['Range'] = range_header
        
        response = requests.get(
            video_url,
            headers=headers,
            timeout=REQUEST_TIMEOUT,
            stream=True,
            allow_redirects=True,
            verify=True
        )
        
        response.raise_for_status()
        
        response_headers = {
            'Content-Type': response.headers.get('Content-Type', 'video/mp4'),
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
            'Access-Control-Allow-Headers': 'Range, Content-Type',
            'Access-Control-Expose-Headers': 'Content-Range, Content-Length, Accept-Ranges',
            'Cache-Control': 'public, max-age=3600',
        }
        
        if response.status_code == 206:
            content_range = response.headers.get('Content-Range')
            if content_range:
                response_headers['Content-Range'] = content_range
            response_headers['Content-Length'] = response.headers.get('Content-Length', '')
            status_code = 206
        else:
            response_headers['Content-Length'] = response.headers.get('Content-Length', '')
            status_code = 200
        
        def generate():
            try:
                for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                    if chunk:
                        yield chunk
            except Exception as e:
                app.logger.error(f"Stream error: {e}")
            finally:
                response.close()
        
        return Response(
            stream_with_context(generate()),
            status=status_code,
            headers=response_headers,
            direct_passthrough=True
        )
    
    except requests.exceptions.Timeout:
        return jsonify({'error': 'Request timed out'}), 504
    except requests.exceptions.RequestException as e:
        return jsonify({'error': str(e)}), 500
    except Exception as e:
        return jsonify({'error': 'Internal server error'}), 500


# ============================================
# Routes - FFmpeg Media Analysis
# ============================================

@app.route('/api/analyze', methods=['POST'])
def analyze():
    """Analyze media file for streams."""
    data = request.get_json() or {}
    url = data.get('url', '').strip()
    
    if not url:
        return jsonify({'error': 'No URL provided'}), 400
    
    is_valid, result = validate_url(url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    url = result
    
    if not check_ffprobe():
        return jsonify({'error': 'FFprobe not installed'}), 500
    
    info = get_media_info(url)
    if not info:
        return jsonify({'error': 'Could not fetch media info'}), 400
    
    fmt = info.get('format', {})
    streams = info.get('streams', [])
    
    video_info = {
        'filename': os.path.basename(fmt.get('filename', 'Unknown')),
        'format': fmt.get('format_name', 'Unknown'),
        'duration': format_duration(fmt.get('duration')),
        'duration_seconds': float(fmt.get('duration', 0)),
        'size': format_size(fmt.get('size')),
        'bitrate': format_bitrate(fmt.get('bit_rate'))
    }
    
    video_streams = []
    audio_streams = []
    subtitle_streams = []
    
    for s in streams:
        codec_type = s.get('codec_type', '')
        idx = s.get('index', 0)
        tags = s.get('tags', {})
        
        if codec_type == 'video':
            fps = s.get('r_frame_rate', 'Unknown')
            if fps and '/' in str(fps):
                try:
                    num, den = map(int, fps.split('/'))
                    fps = f"{num/den:.2f}" if den != 0 else fps
                except:
                    pass
            
            video_streams.append({
                'index': idx,
                'codec': s.get('codec_name', 'Unknown'),
                'resolution': f"{s.get('width', '?')}x{s.get('height', '?')}",
                'width': s.get('width', 0),
                'height': s.get('height', 0),
                'fps': fps,
                'bitrate': format_bitrate(s.get('bit_rate')),
                'title': tags.get('title', f'Video Track {len(video_streams) + 1}')
            })
        
        elif codec_type == 'audio':
            audio_streams.append({
                'index': idx,
                'codec': s.get('codec_name', 'Unknown'),
                'language': tags.get('language', 'und'),
                'title': tags.get('title', f'Audio Track {len(audio_streams) + 1}'),
                'channels': s.get('channels', 2),
                'sample_rate': s.get('sample_rate', 'Unknown'),
                'bitrate': format_bitrate(s.get('bit_rate')),
                'default': s.get('disposition', {}).get('default', 0) == 1
            })
        
        elif codec_type == 'subtitle':
            subtitle_streams.append({
                'index': idx,
                'codec': s.get('codec_name', 'Unknown'),
                'language': tags.get('language', 'und'),
                'title': tags.get('title', f'Subtitle {len(subtitle_streams) + 1}'),
                'default': s.get('disposition', {}).get('default', 0) == 1,
                'forced': s.get('disposition', {}).get('forced', 0) == 1
            })
    
    return jsonify({
        'success': True,
        'video_info': video_info,
        'video_streams': video_streams,
        'audio_streams': audio_streams,
        'subtitle_streams': subtitle_streams
    })


# ============================================
# Routes - Stream with specific audio
# ============================================

@app.route('/api/stream')
def stream_video_with_audio():
    """Stream video with specific audio track using FFmpeg."""
    url = unquote(request.args.get('url', ''))
    audio_index = request.args.get('audio', None)
    
    is_valid, result = validate_url(url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    url = result
    
    if not check_ffmpeg():
        return jsonify({'error': 'FFmpeg not installed'}), 500
    
    if audio_index is None:
        # No audio specified, just proxy the video
        return proxy_video()
    
    try:
        audio_index = int(audio_index)
    except:
        return jsonify({'error': 'Invalid audio index'}), 400
    
    # Use FFmpeg to remux with specific audio track
    cmd = [
        'ffmpeg',
        '-i', url,
        '-map', '0:v:0',              # First video stream
        '-map', f'0:{audio_index}',   # Specific audio stream
        '-c:v', 'copy',               # Copy video codec
        '-c:a', 'aac',                # Convert audio to AAC
        '-b:a', '192k',
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-f', 'mp4',
        'pipe:1'
    ]
    
    def generate():
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            bufsize=32768
        )
        try:
            while True:
                chunk = process.stdout.read(32768)
                if not chunk:
                    break
                yield chunk
        except GeneratorExit:
            process.terminate()
        finally:
            process.wait()
    
    return Response(
        stream_with_context(generate()),
        mimetype='video/mp4',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
        }
    )


# ============================================
# Routes - Subtitle Extraction
# ============================================

@app.route('/api/subtitle')
def get_subtitle():
    """Extract subtitle track as VTT."""
    url = unquote(request.args.get('url', ''))
    stream_index = request.args.get('index', '')
    
    if not url or stream_index == '':
        return jsonify({'error': 'Missing parameters'}), 400
    
    is_valid, result = validate_url(url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    url = result
    
    if not check_ffmpeg():
        return jsonify({'error': 'FFmpeg not installed'}), 500
    
    # Extract as WebVTT for browser compatibility
    cmd = [
        'ffmpeg',
        '-i', url,
        '-map', f'0:{stream_index}',
        '-c:s', 'webvtt',
        '-f', 'webvtt',
        'pipe:1'
    ]
    
    def generate():
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        try:
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            process.wait()
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/vtt',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/vtt; charset=utf-8'
        }
    )


@app.route('/api/subtitle/srt')
def get_subtitle_srt():
    """Extract subtitle track as SRT."""
    url = unquote(request.args.get('url', ''))
    stream_index = request.args.get('index', '')
    
    if not url or stream_index == '':
        return jsonify({'error': 'Missing parameters'}), 400
    
    is_valid, result = validate_url(url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    url = result
    
    cmd = [
        'ffmpeg',
        '-i', url,
        '-map', f'0:{stream_index}',
        '-c:s', 'srt',
        '-f', 'srt',
        'pipe:1'
    ]
    
    def generate():
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        try:
            while True:
                chunk = process.stdout.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            process.wait()
    
    return Response(
        stream_with_context(generate()),
        mimetype='text/plain',
        headers={
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/plain; charset=utf-8'
        }
    )


# ============================================
# Routes - Audio Stream
# ============================================

@app.route('/api/audio')
def stream_audio():
    """Stream audio track as MP3."""
    url = unquote(request.args.get('url', ''))
    stream_index = request.args.get('index', '')
    
    if not url or stream_index == '':
        return jsonify({'error': 'Missing parameters'}), 400
    
    is_valid, result = validate_url(url)
    if not is_valid:
        return jsonify({'error': result}), 400
    
    url = result
    
    cmd = [
        'ffmpeg',
        '-i', url,
        '-map', f'0:{stream_index}',
        '-c:a', 'libmp3lame',
        '-b:a', '192k',
        '-f', 'mp3',
        'pipe:1'
    ]
    
    def generate():
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        try:
            while True:
                chunk = process.stdout.read(32768)
                if not chunk:
                    break
                yield chunk
        finally:
            process.wait()
    
    return Response(
        stream_with_context(generate()),
        mimetype='audio/mpeg',
        headers={'Access-Control-Allow-Origin': '*'}
    )


# ============================================
# Error Handlers
# ============================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({'error': 'Not found'}), 404


@app.errorhandler(500)
def server_error(e):
    return jsonify({'error': 'Internal server error'}), 500


# ============================================
# Main
# ============================================

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    
    ffmpeg_status = "✓ Installed" if check_ffmpeg() else "✗ Not Found"
    ffprobe_status = "✓ Installed" if check_ffprobe() else "✗ Not Found"
    
    print(f"""
╔═══════════════════════════════════════════════════════════╗
║                   MKV Video Player                        ║
╠═══════════════════════════════════════════════════════════╣
║   FFmpeg:  {ffmpeg_status:<44} ║
║   FFprobe: {ffprobe_status:<44} ║
║                                                           ║
║   Server: http://localhost:{port:<6}                        ║
║   Press Ctrl+C to stop                                    ║
╚═══════════════════════════════════════════════════════════╝
    """)
    
    if not check_ffmpeg():
        print("⚠️  WARNING: FFmpeg not found!")
        print("   Audio/Subtitle features won't work.")
        print("   Install: https://ffmpeg.org/download.html\n")
    
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)