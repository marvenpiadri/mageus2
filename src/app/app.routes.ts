import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home-page.component').then((module) => module.HomePageComponent)
  },
  {
    path: 'write',
    loadComponent: () => import('./features/article-studio/article-studio-page.component').then((module) => module.ArticleStudioPageComponent)
  },
  {
    path: 'sign-in',
    loadComponent: () => import('./features/auth/auth-page.component').then((module) => module.AuthPageComponent)
  },
  {
    // Public social profile; posts, shops, location menus, and services are grouped by channel.
    path: ':username',
    loadComponent: () => import('./features/profile/public-profile-page.component').then((module) => module.PublicProfilePageComponent)
  },
  {
    // Published article pages are public and crawlable; no auth guard belongs here.
    path: ':username/:slug',
    loadComponent: () => import('./features/reader/public-article-page.component').then((module) => module.PublicArticlePageComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];