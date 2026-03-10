#!/bin/bash
# Symbiote Video Recording Script
# Usage: ./record-video.sh [duration_seconds]

DURATION=${1:-30}
OUTPUT="symbiote-demo.mp4"

echo "🎬 Recording Symbiote demo for $DURATION seconds..."
echo "📝 Make sure the frontend is running at http://localhost:3000"

# Record screen (display 1, no audio input)
ffmpeg -f avfoundation -i "1:" -t $DURATION -c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p /tmp/screen.mov 2>/dev/null

if [ -f /tmp/screen.mov ]; then
    echo "✅ Screen recorded"
    
    # Check if voiceover exists
    if [ -f /tmp/voiceover.mp3 ]; then
        echo "🎙️ Adding voiceover..."
        # Combine video + audio
        ffmpeg -i /tmp/screen.mov -i /tmp/voiceover.mp3 -c:v copy -c:a aac -shortest -pix_fmt yuv420p "$OUTPUT" 2>/dev/null
        echo "✅ Video with voiceover created: $OUTPUT"
    else
        echo "⚠️ No voiceover found - creating video without audio"
        cp /tmp/screen.mov "$OUTPUT"
    fi
    
    echo "🎉 Output: $OUTPUT"
    ls -lh "$OUTPUT"
else
    echo "❌ Recording failed"
fi
