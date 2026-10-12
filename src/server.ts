import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse
} from '@angular/ssr/node';
import express from 'express';
import { join } from 'node:path';

const app = express();
const angularApp = new AngularNodeAppEngine();
const browserDistFolder = join(import.meta.dirname, '../browser');

app.disable('x-powered-by');
app.use(express.static(browserDistFolder, {
  maxAge: '1y',
  index: false,
  redirect: false
}));

app.use((request, response, next) => {
  angularApp.handle(request).then((result) => {
    if (result) {
      writeResponseToNodeResponse(result, response);
    } else {
      next();
    }
  }).catch(next);
});

if (isMainModule(import.meta.url)) {
  const port = Number(process.env['PORT'] ?? 4000);
  app.listen(port, () => {
    console.log(`Mageus SSR listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);