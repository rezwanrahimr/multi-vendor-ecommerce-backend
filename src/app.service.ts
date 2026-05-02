import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './database/prisma.service';

@Injectable()
export class AppService {
  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async getHealth() {
    const database = await this.getDatabaseStatus();

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      service: this.configService.get<string>('app.name', 'HelloFeni API'),
      environment: this.configService.get<string>('app.nodeEnv', 'development'),
      database,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      docs: '/api/docs',
      openApiJson: '/api/docs-json',
      apiBase: '/api/v1',
    };
  }

  getHomePage() {
    const rows = [
      ['API Base', '/api/v1'],
      ['Swagger UI', '/api/docs'],
      ['OpenAPI JSON', '/api/docs-json'],
      ['Health Check', '/api/v1/health'],
      ['Environment', this.configService.get<string>('app.nodeEnv', 'development')],
      ['Status', 'running'],
    ];

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HelloFeni Backend</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f7f8fa;
      --panel: #ffffff;
      --text: #17202a;
      --muted: #596575;
      --line: #d8dee8;
      --brand: #0f766e;
      --brand-dark: #115e59;
      --accent: #b91c1c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    main {
      width: min(1080px, calc(100% - 32px));
      margin: 0 auto;
      padding: 48px 0;
    }
    .hero {
      display: grid;
      gap: 18px;
      padding: 34px 0 26px;
      border-bottom: 1px solid var(--line);
    }
    .eyebrow {
      color: var(--brand);
      font-weight: 700;
      text-transform: uppercase;
      font-size: 13px;
      letter-spacing: .08em;
    }
    h1 {
      margin: 0;
      max-width: 780px;
      font-size: clamp(34px, 6vw, 58px);
      line-height: 1;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      max-width: 720px;
      color: var(--muted);
      font-size: 17px;
      line-height: 1.6;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 8px;
    }
    a.button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 42px;
      padding: 0 16px;
      border-radius: 8px;
      border: 1px solid var(--brand);
      background: var(--brand);
      color: white;
      text-decoration: none;
      font-weight: 700;
    }
    a.button.secondary {
      background: white;
      color: var(--brand-dark);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 16px;
      margin-top: 26px;
    }
    section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 22px;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 18px;
      letter-spacing: 0;
    }
    dl {
      display: grid;
      gap: 12px;
      margin: 0;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--line);
    }
    .row:last-child { border-bottom: 0; padding-bottom: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; font-weight: 700; text-align: right; }
    ul {
      margin: 0;
      padding-left: 18px;
      color: var(--muted);
      line-height: 1.8;
    }
    code {
      padding: 2px 6px;
      border-radius: 6px;
      background: #eef2f7;
      color: var(--accent);
      font-size: 14px;
    }
    footer {
      margin-top: 22px;
      color: var(--muted);
      font-size: 14px;
    }
    @media (max-width: 760px) {
      main { padding: 28px 0; }
      .grid { grid-template-columns: 1fr; }
      .row { align-items: flex-start; flex-direction: column; gap: 4px; }
      dd { text-align: left; }
    }
  </style>
</head>
<body>
  <main>
    <div class="hero">
      <div class="eyebrow">Backend status</div>
      <h1>HelloFeni.com API</h1>
      <p>Multi-vendor e-commerce backend built with Nest.js, TypeScript, PostgreSQL, Prisma, JWT auth, RBAC, products, orders, payments, reviews, wallets, and delivery workflows.</p>
      <div class="actions">
        <a class="button" href="/api/docs">Open API Docs</a>
        <a class="button secondary" href="/api/v1/health">View Health</a>
      </div>
    </div>
    <div class="grid">
      <section>
        <h2>Runtime</h2>
        <dl>
          ${rows
            .map(
              ([label, value]) => `<div class="row"><dt>${label}</dt><dd><code>${value}</code></dd></div>`,
            )
            .join('')}
        </dl>
      </section>
      <section>
        <h2>Core Modules</h2>
        <ul>
          <li>Auth with JWT and social login base</li>
          <li>Users with Admin, Vendor, Customer, and Delivery Man roles</li>
          <li>Products, categories, orders, reviews, payments, wallets, and delivery</li>
          <li>Global response transform, exception filters, logging middleware, and RBAC guards</li>
        </ul>
      </section>
    </div>
    <footer>Generated by the HelloFeni backend service.</footer>
  </main>
</body>
</html>`;
  }

  private async getDatabaseStatus() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return 'ok';
    } catch {
      return 'unreachable';
    }
  }
}
