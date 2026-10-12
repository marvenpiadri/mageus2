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
    path: 'article/:articleId',
    loadComponent: () => import('./features/reader/reader-page.component').then((module) => module.ReaderPageComponent)
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