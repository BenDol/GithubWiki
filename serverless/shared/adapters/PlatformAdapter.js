/**
 * Platform Adapter
 *
 * Abstracts platform-specific differences between Netlify and Cloudflare
 * Provides unified interface for request handling, response creation, and env access
 */

/**
 * Abstract Platform Adapter Base Class
 * Defines interface that all platform adapters must implement
 */
export class PlatformAdapter {
  constructor(context) {
    this.context = context;
  }

  // ===== Request Handling =====

  /**
   * Get HTTP method from request
   * @returns {string} HTTP method (GET, POST, etc.)
   */
  getMethod() {
    throw new Error('Must implement getMethod()');
  }

  /**
   * Get request body as string
   * @returns {Promise<string>} Request body
   */
  async getBody() {
    throw new Error('Must implement getBody()');
  }

  /**
   * Get request body as parsed JSON
   * @returns {Promise<Object>} Parsed JSON object
   */
  async getJsonBody() {
    const body = await this.getBody();
    return JSON.parse(body);
  }

  /**
   * Get query string parameters
   * @returns {Object} Query parameters as key-value pairs
   */
  getQueryParams() {
    throw new Error('Must implement getQueryParams()');
  }

  /**
   * Get request headers
   * @returns {Object} Headers object
   */
  getHeaders() {
    throw new Error('Must implement getHeaders()');
  }

  /**
   * Get authentication token from Authorization header
   * Extracts Bearer token from "Authorization: Bearer <token>" header
   * @returns {string|null} Token string or null if not found
   */
  getAuthToken() {
    const headers = this.getHeaders();
    const authHeader = headers['authorization'] || headers['Authorization'];

    if (!authHeader) {
      return null;
    }

    // Extract token from "Bearer <token>" format
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1] : null;
  }

  /**
   * Get client IP address
   * @returns {string} Client IP
   */
  getClientIP() {
    throw new Error('Must implement getClientIP()');
  }

  // ===== Response Creation =====

  /**
   * Create HTTP response
   * @param {number} statusCode - HTTP status code
   * @param {Object} body - Response body (will be JSON stringified)
   * @param {Object} headers - Additional headers
   * @returns {Object} Platform-specific response object
   */
  createResponse(statusCode, body, headers = {}) {
    throw new Error('Must implement createResponse()');
  }

  /**
   * Create JSON response with standard headers
   * @param {number} statusCode - HTTP status code
   * @param {Object} data - Response data
   * @returns {Object} Platform-specific response
   */
  createJsonResponse(statusCode, data) {
    return this.createResponse(statusCode, data, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    });
  }

  // ===== Environment Access =====

  /**
   * Get environment variable
   * @param {string} key - Environment variable key
   * @returns {string|undefined} Environment variable value
   */
  getEnv(key) {
    throw new Error('Must implement getEnv()');
  }

  /**
   * Check if environment variable exists
   * @param {string} key - Environment variable key
   * @returns {boolean} True if exists
   */
  hasEnv(key) {
    return this.getEnv(key) !== undefined;
  }

  /**
   * Get all required environment variables
   * @param {string[]} keys - Array of required env var keys
   * @returns {Object} Object with env var values {KEY: value, ...}
   * @throws {Error} If any required env vars are missing
   */
  getRequiredEnv(keys) {
    const values = {};
    const missing = [];

    for (const key of keys) {
      const value = this.getEnv(key);
      if (value === undefined) {
        missing.push(key);
      } else {
        values[key] = value;
      }
    }

    if (missing.length > 0) {
      const varWord = missing.length === 1 ? 'variable' : 'variables';
      throw new Error(`Missing required environment ${varWord}: ${missing.join(', ')}`);
    }

    return values;
  }

  // ===== Platform Info =====

  /**
   * Get platform name
   * @returns {string} Platform name ('netlify' or 'cloudflare')
   */
  getPlatform() {
    throw new Error('Must implement getPlatform()');
  }
}

/**
 * Netlify Platform Adapter
 * Implements platform interface for Netlify Functions
 */
export class NetlifyAdapter extends PlatformAdapter {
  constructor(event) {
    super(event);
    this.event = event;
  }

  getMethod() {
    return this.event.httpMethod;
  }

  async getBody() {
    return this.event.body || '';
  }

  getQueryParams() {
    return this.event.queryStringParameters || {};
  }

  getHeaders() {
    return this.event.headers || {};
  }

  getClientIP() {
    const headers = this.event.headers || {};
    return (
      headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      headers['x-real-ip'] ||
      headers['client-ip'] ||
      'unknown'
    );
  }

  createResponse(statusCode, body, headers = {}) {
    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: typeof body === 'string' ? body : JSON.stringify(body)
    };
  }

  getEnv(key) {
    return process.env[key];
  }

  getPlatform() {
    return 'netlify';
  }
}

/**
 * Cloudflare Platform Adapter
 * Implements platform interface for Cloudflare Pages Functions
 */
export class CloudflareAdapter extends PlatformAdapter {
  constructor(context) {
    super(context);
    this.request = context.request;
    this.env = context.env;
    this.ctx = context;
  }

  getMethod() {
    return this.request.method;
  }

  async getBody() {
    return await this.request.text();
  }

  getQueryParams() {
    const url = new URL(this.request.url);
    const params = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });
    return params;
  }

  getHeaders() {
    const headers = {};
    this.request.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }

  getClientIP() {
    // Try different case variations since Map in tests is case-sensitive
    // but real Headers objects are case-insensitive
    const cfIP = this.request.headers.get('CF-Connecting-IP') ||
                 this.request.headers.get('cf-connecting-ip');
    if (cfIP) return cfIP;

    const forwardedFor = this.request.headers.get('X-Forwarded-For') ||
                        this.request.headers.get('x-forwarded-for');
    if (forwardedFor) return forwardedFor.split(',')[0]?.trim();

    return 'unknown';
  }

  createResponse(statusCode, body, headers = {}) {
    return new Response(
      typeof body === 'string' ? body : JSON.stringify(body),
      {
        status: statusCode,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }
    );
  }

  getEnv(key) {
    return this.env[key];
  }

  getPlatform() {
    return 'cloudflare';
  }
}
