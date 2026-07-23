import { Controller, Get, Header } from '@nestjs/common';
import { Public } from '../../common/auth/decorators';
import { buildOpenApiDocument } from './openapi.builder';

const SWAGGER_UI_VERSION = '5.17.14';

/** API docs: spec at /docs/openapi.json, interactive UI at /docs. */
@Public()
@Controller('docs')
export class DocsController {
  private document: object | null = null;

  @Get('openapi.json')
  spec(): object {
    this.document ??= buildOpenApiDocument();
    return this.document;
  }

  @Get()
  @Header('content-type', 'text/html; charset=utf-8')
  ui(): string {
    // Dev-facing docs page; Swagger UI assets from the public CDN. The spec
    // itself is served locally — air-gapped environments still have the JSON.
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Last Chance API — Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@${SWAGGER_UI_VERSION}/swagger-ui-bundle.js"></script>
  <script>
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
      deepLinking: true,
      displayRequestDuration: true,
    });
  </script>
</body>
</html>`;
  }
}
