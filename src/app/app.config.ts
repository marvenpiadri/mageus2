import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { ExplorationRouteReuseStrategy } from './core/exploration-route-reuse.strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ExplorationRouteReuseStrategy,
    { provide: RouteReuseStrategy, useExisting: ExplorationRouteReuseStrategy },
    provideAppInitializer(() => inject(AuthService).restoreSession()),
    provideRouter(
      routes,
      withComponentInputBinding()
    ),
    provideHttpClient(withFetch())
  ]
};