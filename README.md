# Scoala Noua Catalog Crawler

A lightweight Node.js web crawler for scoalanoua.ro that performs authenticated web scraping through a simple HTTP API.

## Features

- Zero external dependencies (uses only Node.js built-in modules)
- Three-step crawling: fetch CSRF token → login with RSA encryption → fetch target page
- RSA password encryption using Node.js crypto module
- CSRF token extraction and handling
- Simple HTTP server with JSON responses
- Docker support with lightweight Alpine image
- Environment-based configuration (no hardcoded credentials)

## Requirements

- Node.js 18+ (for native fetch API)
- Docker (optional, for containerized deployment)

## Project Structure

```
.
├── src/
│   ├── server.js      # HTTP server
│   ├── crawler.js     # Crawling logic
│   └── config.js      # Configuration management
├── Dockerfile
├── .dockerignore
├── .env.example
└── package.json
```

## Configuration

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Required environment variables:

- `USERNAME` - Scoala Noua login username (REQUIRED)
- `PASSWORD` - Scoala Noua login password (REQUIRED)

Optional environment variables (with defaults):

- `PORT` - Server port (default: 3000)
- `LOGIN_PAGE_URL` - Login page URL (default: https://www.scoalanoua.ro/)
- `LOGIN_URL` - Login POST endpoint (default: https://www.scoalanoua.ro/login)
- `TARGET_URL` - Target page to crawl (default: https://www.scoalanoua.ro/elev?summary=1)

## Running Locally

### Install dependencies (if any):
```bash
npm install
```

### Start the server:
```bash
npm start
```

### Development mode (with auto-reload):
```bash
npm run dev
```

The server will start on `http://localhost:3000` (or your configured PORT).

## Running with Docker

### Build the image:
```bash
docker build -t scoalanoua-crawler .
```

### Run the container:
```bash
docker run -d \
  -p 3000:3000 \
  -e USERNAME=your_scoalanoua_username \
  -e PASSWORD=your_scoalanoua_password \
  --name scoalanoua-crawler \
  scoalanoua-crawler
```


Or use environment file:
```bash
docker run -d \
  -p 3000:3000 \
  --env-file .env \
  --name scoalanoua-crawler \
  scoalanoua-crawler
```

### Check logs:
```bash
docker logs scoalanoua-crawler
```

### Stop the container:
```bash
docker stop scoalanoua-crawler
docker rm scoalanoua-crawler
```

## Using Makefile

For convenience, a Makefile is provided with common Docker commands:

```bash
make build    # Build the Docker image
make run      # Run the container with --rm flag (uses .env file)
make help     # Show available commands
```

## Docker Compose Example

Sample `docker-compose.yml`:

```yaml
version: '3.8'

services:
  crawler:
    build: .
    image: scoalanoua-crawler
    container_name: scoalanoua-crawler
    ports:
      - "3000:3000"
    environment:
      - USERNAME=${USERNAME}
      - PASSWORD=${PASSWORD}
    restart: unless-stopped
```

## API Endpoints

### GET /crawl

Triggers the crawl process and returns results.

**Response:**
```json
{
  "success": true,
  "timestamp": "2026-03-29T10:30:00.000Z",
  "result": {
    "statusCode": 200,
    "contentType": "text/html",
    "data": "..."
  }
}
```

**Error response:**
```json
{
  "success": false,
  "timestamp": "2026-03-29T10:30:00.000Z",
  "error": "Login failed: 401 Unauthorized"
}
```

### GET /health

Health check endpoint for monitoring.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-29T10:30:00.000Z"
}
```

## How It Works

The crawler performs a three-step authentication and crawl process:

1. **Fetch Login Page** (GET `https://www.scoalanoua.ro/`)
   - Extracts CSRF token from the login form
   - Extracts RSA public key from the page JavaScript

2. **Submit Login** (POST `https://www.scoalanoua.ro/login`)
   - Encrypts password using RSA public key (Node.js crypto module)
   - Submits form with: `login[_token]`, `login[username]`, `login[password]`, `login[encrypted_password]`
   - Receives 302 redirect and extracts session cookies

3. **Fetch Target Page** (GET `https://www.scoalanoua.ro/elev?summary=1`)
   - Uses session cookies from login
   - Returns page content

All cookies are handled automatically between steps.

## Usage Example

```bash
# Trigger crawl
curl http://localhost:3000/crawl

# Check health
curl http://localhost:3000/health
```

## Customization

The crawler currently returns raw response data. To customize parsing:

1. Edit `src/crawler.js`
2. Modify the `fetchTargetPage()` function
3. Add your custom parsing logic for the response data

## Troubleshooting

### "Missing required environment variables"
Ensure all required environment variables are set (.env file or docker -e flags).

### "Login failed: 401 Unauthorized"
Check that USERNAME and PASSWORD are correct.

### "No cookies received from login response"
The login endpoint may not be setting session cookies. Check the login URL and response format.

## License

ISC
