import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './assets/main.css';
import './shared/edm-embeds.css';

createApp(App).use(router).mount('#app');
