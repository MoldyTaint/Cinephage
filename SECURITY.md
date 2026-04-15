# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |

As Cinephage is in active development, security updates are applied to the current stable release. Users are encouraged to keep their installations up to date.

## Reporting a Vulnerability

If you find a security issue, please report it responsibly.

### How to Report

1. **Do not** open a public GitHub issue for security vulnerabilities
2. Email security concerns to the project maintainers (create a private security advisory on GitHub)
3. Use GitHub's private vulnerability reporting feature if available

### What to Include

When reporting a vulnerability, please include:

- A clear description of the vulnerability
- Steps to reproduce the issue
- Potential impact assessment
- Any suggested fixes (optional)
- Your contact information for follow-up questions

### Response Timeline

- **Initial Response**: Within 48 hours of receiving your report
- **Status Update**: Within 7 days with an assessment of the vulnerability
- **Resolution**: Depends on severity and complexity, but we aim to address critical issues within 14 days

### After Reporting

- We will acknowledge receipt of your report
- We will investigate and validate the vulnerability
- We will work on a fix and coordinate disclosure timing with you
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices

### Network Security

Cinephage is designed for use on trusted local networks. When exposing the application to external networks:

1. **Use a Reverse Proxy**
   - Deploy nginx, Caddy, or Traefik in front of Cinephage
   - Configure SSL/TLS with valid certificates
   - Enable HTTPS-only access

2. **Configure CSRF Protection**
   - Set the `ORIGIN` environment variable to your access URL
   - Example: `ORIGIN=https://cinephage.example.com`
   - Set `BETTER_AUTH_URL` to the same public URL for auth callbacks and redirects

3. **Authentication**
   - Cinephage does not currently include built-in authentication
   - Use reverse proxy authentication (basic auth, OAuth proxy, etc.)
   - Consider VPN access for remote usage

### Application Security

1. **Keep Updated**
   - Regularly update to the current stable release (`latest`) or a newer stable `vX.Y.Z`
   - Monitor the repository for security advisories

2. **Environment Variables**
   - Never commit `.env` files to version control
   - Use appropriate file permissions (600 or 640)
   - Rotate credentials if compromised

3. **API Keys**
   - Store API keys securely
   - Use separate API keys for production and development
   - Revoke unused or compromised keys immediately

4. **File System**
   - Configure appropriate permissions on media directories
   - Limit write access to necessary directories only
   - Review root folder configurations periodically

### Download Client Security

1. **qBittorrent**
   - Use strong passwords for WebUI access
   - Enable HTTPS for qBittorrent WebUI if accessing remotely
   - Consider binding to localhost and using a VPN

2. **Torrent Traffic**
   - Use a VPN for torrent traffic where appropriate
   - Configure your torrent client's privacy settings

## Known Security Considerations

### No Built-in Authentication

Cinephage does not currently implement user authentication. Anyone with network access to the application can:

- View and modify library contents
- Trigger downloads
- Modify settings

**Mitigation**: Use reverse proxy authentication or restrict network access.

### API Access

All API endpoints are accessible without authentication. This is by design for local network use but requires consideration for exposed installations.

**Mitigation**: Implement authentication at the reverse proxy level.

### Indexer Credentials

Credentials for private indexers are stored in the SQLite database. While the database is local, ensure:

- Appropriate file system permissions on `data/cinephage.db`
- Backups are stored securely
- Database is not exposed via web server misconfiguration

### Logging

Log files may contain:

- Search queries
- Downloaded file names
- Error messages with paths

**Mitigation**: Review log retention policies and secure log directory access.

## Security Updates

Security updates will be announced through:

- GitHub Security Advisories
- Release notes in CHANGELOG.md
- Repository releases

## Responsible Disclosure

If you report responsibly:

- We'll work with you in good faith
- You'll get credit (unless you want to stay anonymous)
- No legal action against good-faith researchers
- We'll coordinate disclosure timing with you

For security issues, use GitHub's private vulnerability reporting.
