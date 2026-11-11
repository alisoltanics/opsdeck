#!/bin/sh
# Keep the Chromium sandbox helper usable when installed system-wide.
chmod 4755 /opt/OpsDeck/chrome-sandbox 2>/dev/null || true
exit 0
