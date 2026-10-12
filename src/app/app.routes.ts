import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    data: { preserveExplorationState: true },
    loadComponent: () => import('./features/home/home-page.component').then((module) => module.HomePageComponent)
  },
  {
    path: 'magazines',
    data: { preserveExplorationState: true },
    loadComponent: () => import('./features/magazines/magazine-discovery-page.component').then((module) => module.MagazineDiscoveryPageComponent)
  },
  {
    path: ':username/magazines/:magazineSlug/issues/:issueSlug',
    loadComponent: () => import('./features/magazines/magazine-detail-page.component').then((module) => module.MagazineDetailPageComponent)
  },
  {
    path: ':username/magazines/:magazineSlug',
    loadComponent: () => import('./features/magazines/magazine-detail-page.component').then((module) => module.MagazineDetailPageComponent)
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
    path: 'feed',
    data: { preserveExplorationState: true },
    loadComponent: () => import('./features/feed/feed-page.component').then((module) => module.FeedPageComponent)
  },
  {
    path: 'settings',
    loadComponent: () => import('./features/settings/account-settings-page.component').then((module) => module.AccountSettingsPageComponent)
  },
  {
    path: 'notifications',
    loadComponent: () => import('./features/notifications/notifications-page.component').then((module) => module.NotificationsPageComponent)
  },
  {
    path: 'business/locations',
    loadComponent: () => import('./features/business/business-locations-page.component').then((module) => module.BusinessLocationsPageComponent)
  },
  {
    path: 'business/menus',
    loadComponent: () => import('./features/business/business-menus-page.component').then((module) => module.BusinessMenusPageComponent)
  },
  {
    path: 'business/shops',
    loadComponent: () => import('./features/business/business-shops-page.component').then((module) => module.BusinessShopsPageComponent)
  },
  {
    path: 'business/catalog',
    loadComponent: () => import('./features/business/business-catalog-page.component').then((module) => module.BusinessCatalogPageComponent)
  },
  {
    // Published article pages are public and crawlable; no auth guard belongs here.
    path: ':username/:slug',
    loadComponent: () => import('./features/reader/public-article-page.component').then((module) => module.PublicArticlePageComponent)
  },
  {
    // Public social profile; posts, shops, location menus, and services are grouped by channel.
    path: ':username',
    data: { preserveExplorationState: true },
    loadComponent: () => import('./features/profile/public-profile-page.component').then((module) => module.PublicProfilePageComponent)
  },
  {
    path: '**',
    redirectTo: ''
  }
];