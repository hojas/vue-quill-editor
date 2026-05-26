<template>
  <div class="upgrade-page">
    <div class="upgrade-card">
      <div class="upgrade-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1>系统升级中</h1>
      <p>请稍后重试</p>
    </div>
  </div>
</template>

<style scoped>
.upgrade-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  min-height: 100dvh;
  padding: 24px;
  background: #f2f5f9;
}

.upgrade-card {
  text-align: center;
  max-width: 320px;
  width: 100%;
  color: #1f2a37;
}

.upgrade-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 24px;
  background: rgba(102, 126, 234, 0.1);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  animation: pulse 2s ease-in-out infinite;
}

.upgrade-icon svg {
  width: 36px;
  height: 36px;
  opacity: 0.9;
}

h1 {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.02em;
  margin-bottom: 10px;
}

p {
  font-size: 15px;
  opacity: 0.75;
  line-height: 1.6;
}

@keyframes pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.08);
    opacity: 0.7;
  }
}
</style>
