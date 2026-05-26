import { createRouter, createWebHashHistory } from 'vue-router';
import DemoPage from '../pages/DemoPage.vue';
import UpgradePage from '../pages/UpgradePage.vue';

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'demo', component: DemoPage },
    { path: '/upgrade', name: 'upgrade', component: UpgradePage },
  ],
});
