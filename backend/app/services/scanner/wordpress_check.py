"""
app/services/scanner/wordpress_check.py
WordPress detection, version fingerprinting, plugin enumeration, and vulnerability assessment.
"""
import logging
import re
from typing import Any
from urllib.parse import urljoin

import aiohttp
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Minimum supported WordPress version (update periodically)
MIN_SUPPORTED_WP_VERSION = "6.4"

WP_INDICATORS = [
    "/wp-login.php",
    "/wp-content/",
    "/wp-includes/",
    "/xmlrpc.php",
]

COMMON_PLUGINS = [
    "woocommerce",
    "contact-form-7",
    "yoast-seo",
    "wordfence",
    "wpforms-lite",
    "elementor",
    "akismet",
    "jetpack",
    "all-in-one-seo-pack",
    "wp-super-cache",
]


def _parse_version(text: str) -> str | None:
    """Extract WP version string from readme or meta tag content."""
    match = re.search(r"(?:Version|wordpress\s+)[\s:]*(\d+\.\d+(?:\.\d+)?)", text, re.IGNORECASE)
    return match.group(1) if match else None


def _version_is_outdated(version: str, minimum: str) -> bool:
    """Return True if *version* is older than *minimum*."""
    try:
        v_parts = [int(x) for x in version.split(".")]
        m_parts = [int(x) for x in minimum.split(".")]
        # Pad to same length
        while len(v_parts) < len(m_parts):
            v_parts.append(0)
        while len(m_parts) < len(v_parts):
            m_parts.append(0)
        return v_parts < m_parts
    except ValueError:
        return False


async def _fetch_text(
    url: str,
    session: aiohttp.ClientSession,
    timeout: int = 10,
) -> str | None:
    """Fetch the text body of a URL; returns None on any error."""
    try:
        async with session.get(
            url,
            allow_redirects=True,
            timeout=aiohttp.ClientTimeout(total=timeout),
            ssl=False,
        ) as resp:
            if resp.status == 200:
                return await resp.text(errors="replace")
    except Exception as exc:  # noqa: BLE001
        logger.debug("WP check — fetch error for %s: %s", url, exc)
    return None


async def check_wordpress(
    url: str,
    session: aiohttp.ClientSession,
) -> dict[str, Any]:
    """
    Detect WordPress installation and enumerate security issues.

    Checks performed:
        - WordPress presence via known paths
        - Version extraction from readme.html and generator meta tag
        - Plugin enumeration from /wp-content/plugins/ and page source
        - REST API user enumeration via /wp-json/wp/v2/users
        - xmlrpc.php accessibility
        - Version currency vs minimum supported release

    Args:
        url: Base URL of the target site.
        session: Shared aiohttp ClientSession.

    Returns:
        dict with keys:
            - is_wordpress: bool
            - version: str | None
            - version_outdated: bool
            - plugins: list[str]
            - themes: list[str]
            - findings: list[dict]
    """
    base = url.rstrip("/")
    findings: list[dict[str, Any]] = []
    is_wordpress = False
    version: str | None = None
    version_outdated = False
    plugins: list[str] = []
    themes: list[str] = []

    try:
        # ---------------------------------------------------------------
        # 1. Detect WordPress presence
        # ---------------------------------------------------------------
        homepage_text = await _fetch_text(base, session)
        wp_login_url = f"{base}/wp-login.php"
        wp_login_text = await _fetch_text(wp_login_url, session)

        if wp_login_text and "wp-login" in wp_login_text.lower():
            is_wordpress = True
        elif homepage_text and (
            "wp-content" in homepage_text.lower()
            or "wp-includes" in homepage_text.lower()
        ):
            is_wordpress = True

        if not is_wordpress:
            return {
                "is_wordpress": False,
                "version": None,
                "version_outdated": False,
                "plugins": [],
                "themes": [],
                "findings": findings,
            }

        # ---------------------------------------------------------------
        # 2. Version detection
        # ---------------------------------------------------------------
        readme_text = await _fetch_text(f"{base}/readme.html", session)
        if readme_text:
            version = _parse_version(readme_text)
            if version:
                findings.append({
                    "category": "WordPress",
                    "title": "WordPress Version Disclosed in readme.html",
                    "description": (
                        f"WordPress version {version} is publicly disclosed in /readme.html. "
                        "This information helps attackers target known vulnerabilities specific "
                        "to this release."
                    ),
                    "severity": "medium",
                    "affected_url": f"{base}/readme.html",
                    "evidence": f"Version {version} found in /readme.html",
                    "remediation": (
                        "Delete or restrict access to /readme.html, /license.txt, and "
                        "/wp-admin/install.php. Add a rule to your .htaccess or nginx config "
                        "to block access to these files."
                    ),
                })

        # Fallback: generator meta tag in homepage
        if not version and homepage_text:
            soup = BeautifulSoup(homepage_text, "html.parser")
            generator = soup.find("meta", attrs={"name": "generator"})
            if generator and generator.get("content"):
                content = generator["content"]
                v = _parse_version(content)
                if v:
                    version = v
                    findings.append({
                        "category": "WordPress",
                        "title": "WordPress Version in Meta Generator Tag",
                        "description": (
                            f"WordPress version {version} is disclosed via the <meta name='generator'> "
                            "tag in the page HTML."
                        ),
                        "severity": "medium",
                        "affected_url": base,
                        "evidence": f"<meta name='generator' content='{content}'>",
                        "remediation": (
                            "Remove the generator meta tag by adding the following to your "
                            "theme's functions.php: "
                            "remove_action('wp_head', 'wp_generator');"
                        ),
                    })

        # ---------------------------------------------------------------
        # 3. Outdated version check
        # ---------------------------------------------------------------
        if version and _version_is_outdated(version, MIN_SUPPORTED_WP_VERSION):
            version_outdated = True
            findings.append({
                "category": "WordPress",
                "title": f"Outdated WordPress Version: {version}",
                "description": (
                    f"The detected WordPress version ({version}) is below the minimum recommended "
                    f"version ({MIN_SUPPORTED_WP_VERSION}). Outdated WordPress installations contain "
                    "known vulnerabilities that are actively exploited by automated attack tools."
                ),
                "severity": "high",
                "affected_url": base,
                "evidence": f"Detected version: {version}",
                "remediation": (
                    "Update WordPress to the latest stable version immediately via "
                    "Dashboard → Updates. Enable automatic background updates for minor releases "
                    "by adding 'define(\"WP_AUTO_UPDATE_CORE\", true);' to wp-config.php."
                ),
            })

        # ---------------------------------------------------------------
        # 4. Plugin enumeration from source
        # ---------------------------------------------------------------
        if homepage_text:
            plugin_matches = re.findall(r"/wp-content/plugins/([a-zA-Z0-9_-]+)/", homepage_text)
            plugins = list(set(plugin_matches))

        # Also check known common plugins
        for plugin in COMMON_PLUGINS:
            plugin_url = f"{base}/wp-content/plugins/{plugin}/"
            try:
                async with session.head(
                    plugin_url,
                    allow_redirects=False,
                    timeout=aiohttp.ClientTimeout(total=5),
                    ssl=False,
                ) as resp:
                    if resp.status in (200, 403) and plugin not in plugins:
                        plugins.append(plugin)
            except Exception:  # noqa: BLE001
                pass

        # ---------------------------------------------------------------
        # 5. Theme enumeration
        # ---------------------------------------------------------------
        if homepage_text:
            theme_matches = re.findall(r"/wp-content/themes/([a-zA-Z0-9_-]+)/", homepage_text)
            themes = list(set(theme_matches))

        # ---------------------------------------------------------------
        # 6. REST API user enumeration
        # ---------------------------------------------------------------
        users_api_url = f"{base}/wp-json/wp/v2/users"
        users_text = await _fetch_text(users_api_url, session)
        if users_text and '"id"' in users_text and '"name"' in users_text:
            findings.append({
                "category": "WordPress",
                "title": "User Enumeration via REST API",
                "description": (
                    f"The WordPress REST API endpoint {users_api_url} discloses usernames "
                    "and user IDs. This information can be used in targeted brute-force "
                    "attacks against admin accounts."
                ),
                "severity": "high",
                "affected_url": users_api_url,
                "evidence": "REST API /wp/v2/users returned user data without authentication.",
                "remediation": (
                    "Restrict the REST API users endpoint by adding the following to functions.php:\n"
                    "add_filter('rest_endpoints', function($endpoints) {\n"
                    "    if (isset($endpoints['/wp/v2/users'])) {\n"
                    "        unset($endpoints['/wp/v2/users']);\n"
                    "    }\n"
                    "    return $endpoints;\n"
                    "});\n"
                    "Alternatively, use a security plugin like Wordfence or iThemes Security."
                ),
            })

        # ---------------------------------------------------------------
        # 7. xmlrpc.php check
        # ---------------------------------------------------------------
        xmlrpc_url = f"{base}/xmlrpc.php"
        xmlrpc_text = await _fetch_text(xmlrpc_url, session)
        if xmlrpc_text and "xmlrpc" in xmlrpc_text.lower():
            findings.append({
                "category": "WordPress",
                "title": "XML-RPC Interface Enabled",
                "description": (
                    "The xmlrpc.php endpoint is accessible and responding. XML-RPC is a legacy "
                    "WordPress API that is frequently exploited for brute-force amplification attacks "
                    "(system.multicall allows thousands of password attempts in a single request) "
                    "and DDoS amplification."
                ),
                "severity": "medium",
                "affected_url": xmlrpc_url,
                "evidence": f"xmlrpc.php returned HTTP 200 with XML content.",
                "remediation": (
                    "Disable XML-RPC if not actively used by adding to .htaccess:\n"
                    "<Files xmlrpc.php>\n"
                    "    Order Deny,Allow\n"
                    "    Deny from all\n"
                    "</Files>\n"
                    "Or use the Disable XML-RPC plugin. If XML-RPC is required (e.g. for "
                    "Jetpack), restrict it to known IP addresses only."
                ),
            })

    except Exception as exc:  # noqa: BLE001
        logger.exception("WordPress check — unexpected error for %s: %s", url, exc)

    return {
        "is_wordpress": is_wordpress,
        "version": version,
        "version_outdated": version_outdated,
        "plugins": plugins,
        "themes": themes,
        "findings": findings,
    }
