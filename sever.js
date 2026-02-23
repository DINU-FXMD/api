const express = require('express');
const cors = require('cors');
const { createDecipheriv } = require('crypto');
const axios = require('axios');
const yts = require('yt-search');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Utility functions (same as before)
function get_id(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|v\/|embed\/|user\/[^\/\n\s]+\/)?(?:watch\?v=|v%3D|embed%2F|video%2F)?|youtu\.be\/|youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/v\/|youtube\.com\/shorts\/|youtube\.com\/playlist\?list=)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

function make_id(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}

function format_date(input) {
    const date = new Date(input);
    const options = {
        timeZone: "Asia/Jakarta",
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat("id-ID", options);
    const formatted = formatter.format(date);
    return `${formatted.replace(".", ":")} WIB`;
}

const decode = (enc) => {
    try {
        const secret_key = 'C5D58EF67A7584E4A29F6C35BBC4EB12'
        const data = Buffer.from(enc, 'base64')
        const iv = data.slice(0, 16)
        const content = data.slice(16)
        const key = Buffer.from(secret_key, 'hex')

        const decipher = createDecipheriv('aes-128-cbc', key, iv)
        let decrypted = Buffer.concat([decipher.update(content), decipher.final()])

        return JSON.parse(decrypted.toString())
    } catch (error) {
        throw new Error(error.message)
    }
}

// Available qualities
const audioQualities = [92, 128, 256, 320];
const videoQualities = [144, 360, 480, 720, 1080];

async function savetube(link, quality, value) {
    try {
        const cdn = (await axios.get("https://media.savetube.me/api/random-cdn")).data.cdn
        const infoget = (await axios.post('https://' + cdn + '/v2/info', {
            'url': link
        }, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://yt.savetube.me/1kejjj1?id=362796039'
            }
        })).data
        const info = decode(infoget.data)

        const response = (await axios.post('https://' + cdn + '/download', {
            'downloadType': value,
            'quality': `${quality}`,
            'key': info.key
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://yt.savetube.me/start-download?from=1kejjj1%3Fid%3D362796039'
            }
        })).data

        return {
            status: true,
            quality: `${quality}${value === "audio" ? "kbps" : "p"}`,
            availableQuality: value === "audio" ? audioQualities : videoQualities,
            url: response.data.downloadUrl,
            filename: `${info.title} (${quality}${value === "audio" ? "kbps).mp3" : "p).mp4"}`
        }
    } catch (error) {
        console.error("Converting error:", error)
        return {
            status: false,
            message: "Converting error"
        }
    }
}

// Routes (same as before)

// Home route
app.get('/', (req, res) => {
    res.json({
        message: 'YouTube Downloader API - Deployed on Vercel',
        version: '1.0.0',
        endpoints: {
            '/api/qualities': 'GET - Get available qualities',
            '/api/search': 'GET - Search YouTube videos',
            '/api/metadata': 'GET - Get video metadata',
            '/api/channel': 'GET - Get channel info',
            '/api/download/mp3': 'GET - Download audio',
            '/api/download/mp4': 'GET - Download video',
            '/api/download/all': 'GET - Get all available download options'
        },
        example: {
            search: '/api/search?query=nodejs tutorial',
            metadata: '/api/metadata?url=https://youtube.com/watch?v=VIDEO_ID',
            download_mp3: '/api/download/mp3?url=https://youtube.com/watch?v=VIDEO_ID&quality=320',
            download_mp4: '/api/download/mp4?url=https://youtube.com/watch?v=VIDEO_ID&quality=720'
        }
    });
});

// Get available qualities
app.get('/api/qualities', (req, res) => {
    res.json({
        audio: audioQualities.map(q => `${q}kbps`),
        video: videoQualities.map(q => `${q}p`)
    });
});

// Search YouTube videos
app.get('/api/search', async (req, res) => {
    try {
        const { query } = req.query;
        
        if (!query) {
            return res.status(400).json({
                status: false,
                message: 'Query parameter is required'
            });
        }

        let data = await yts(query);
        res.json({
            status: true,
            results: data.all
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: error.message
        });
    }
});

// Get video metadata
app.get('/api/metadata', async (req, res) => {
    try {
        const { url } = req.query;
        const id = get_id(url);

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Invalid YouTube URL"
            });
        }

        const response = await axios.get('https://ytapi.apps.mattw.io/v3/videos', {
            params: {
                'key': 'foo1',
                'quotaUser': make_id(40),
                'part': 'snippet,statistics,recordingDetails,status,liveStreamingDetails,localizations,contentDetails,paidProductPlacementDetails,player,topicDetails',
                'id': id,
                '_': Date.now()
            },
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://mattw.io/youtube-metadata/'
            }
        });

        if (response.data.items.length === 0) {
            return res.status(404).json({
                status: false,
                message: "Video not found"
            });
        }

        const snippet = response.data.items[0].snippet;
        const statistics = response.data.items[0].statistics;

        res.json({
            id: id,
            channel_id: snippet.channelId,
            channel_title: snippet.channelTitle,
            title: snippet.title,
            description: snippet.description,
            thumbnails: Object.entries(snippet.thumbnails).map(([quality, data]) => ({
                quality,
                ...data
            })),
            tags: snippet.tags,
            published_date: snippet.publishedAt,
            published_format: format_date(snippet.publishedAt),
            statistics: {
                like: statistics.likeCount,
                view: statistics.viewCount,
                favorit: statistics.favoriteCount,
                comment: statistics.commentCount
            }
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: "Server error"
        });
    }
});

// Get channel info
app.get('/api/channel', async (req, res) => {
    try {
        const { username, url } = req.query;
        const input = url || username;

        if (!input) {
            return res.status(400).json({
                status: false,
                message: "Username or URL parameter is required"
            });
        }

        const channelUrl = input.startsWith('http') ? input : "https://www.youtube.com/" + input.replace(/@/g, "");

        const response = await axios.get('https://ytapi.apps.mattw.io/v1/resolve_url', {
            params: {
                'url': channelUrl
            },
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://mattw.io/youtube-metadata/'
            }
        });

        if (response.data.message) {
            return res.status(404).json({
                status: false,
                message: response.data.message
            });
        }

        const result = await axios.get('https://ytapi.apps.mattw.io/v3/channels', {
            params: {
                'key': 'foo1',
                'quotaUser': make_id(40),
                'part': 'id,snippet,statistics,brandingSettings,contentDetails,localizations,status,topicDetails',
                'id': response.data.channelId,
                '_': Date.now()
            },
            headers: {
                'Accept': 'application/json, text/javascript, */*; q=0.01',
                'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
                'Referer': 'https://mattw.io/youtube-metadata/'
            }
        });

        if (result.data.items.length === 0) {
            return res.status(404).json({
                status: false,
                message: "Channel not found"
            });
        }

        const snippet = result.data.items[0].snippet;
        const statistics = result.data.items[0].statistics;

        res.json({
            id: response.data.channelId,
            title: snippet.title,
            description: snippet.description,
            username: snippet.customUrl,
            thumbnails: Object.entries(snippet.thumbnails).map(([quality, data]) => ({
                quality,
                ...data
            })),
            banner: result.data.items[0].brandingSettings.image.bannerExternalUrl,
            published_date: snippet.publishedAt,
            published_format: format_date(snippet.publishedAt),
            statistics: {
                view: statistics.viewCount,
                video: statistics.videoCount,
                subscriber: statistics.subscriberCount
            }
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: "Server error"
        });
    }
});

// Download MP3
app.get('/api/download/mp3', async (req, res) => {
    try {
        const { url, quality = 128 } = req.query;
        const id = get_id(url);
        const format = audioQualities.includes(Number(quality)) ? Number(quality) : 128;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Invalid YouTube URL"
            });
        }

        const youtubeUrl = "https://youtube.com/watch?v=" + id;
        const data = await yts(youtubeUrl);
        const response = await savetube(youtubeUrl, format, "audio");

        if (!response.status) {
            return res.status(500).json(response);
        }

        res.json({
            status: true,
            metadata: data.all[0],
            download: response
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: "Server error"
        });
    }
});

// Download MP4
app.get('/api/download/mp4', async (req, res) => {
    try {
        const { url, quality = 360 } = req.query;
        const id = get_id(url);
        const format = videoQualities.includes(Number(quality)) ? Number(quality) : 360;

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Invalid YouTube URL"
            });
        }

        const youtubeUrl = "https://youtube.com/watch?v=" + id;
        const data = await yts(youtubeUrl);
        const response = await savetube(youtubeUrl, format, "video");

        if (!response.status) {
            return res.status(500).json(response);
        }

        res.json({
            status: true,
            metadata: data.all[0],
            download: response
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: "Server error"
        });
    }
});

// Get all download options for a video
app.get('/api/download/all', async (req, res) => {
    try {
        const { url } = req.query;
        const id = get_id(url);

        if (!id) {
            return res.status(400).json({
                status: false,
                message: "Invalid YouTube URL"
            });
        }

        const youtubeUrl = "https://youtube.com/watch?v=" + id;
        const data = await yts(youtubeUrl);

        // Get all audio qualities
        const audioDownloads = await Promise.all(
            audioQualities.map(async (quality) => {
                const result = await savetube(youtubeUrl, quality, "audio");
                return {
                    quality: `${quality}kbps`,
                    format: 'mp3',
                    ...result
                };
            })
        );

        // Get all video qualities
        const videoDownloads = await Promise.all(
            videoQualities.map(async (quality) => {
                const result = await savetube(youtubeUrl, quality, "video");
                return {
                    quality: `${quality}p`,
                    format: 'mp4',
                    ...result
                };
            })
        );

        res.json({
            status: true,
            metadata: data.all[0],
            downloads: {
                audio: audioDownloads,
                video: videoDownloads
            }
        });
    } catch (error) {
        res.status(500).json({
            status: false,
            message: "Server error"
        });
    }
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        status: false,
        message: 'Something went wrong!'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        status: false,
        message: 'Endpoint not found'
    });
});

// Export for Vercel
module.exports = app;
