<template>
  <div v-if="updateAvailable" class="version-detect-container">
    <div class="version-card">
      <div class="version-card-header">
        <div class="version-icon">
          <svg
            class="version-icon-svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M12 4v13m0 0l-5-5m5 5l5-5M5 21h14"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </div>
        <div class="version-text">
          <div class="version-title">{{ $t('version.newVersion') }}</div>
          <div class="version-message">
            {{ $t('version.readyMessage', { version: updateInfo?.version }) }}
          </div>
        </div>
        <button
          class="close-button"
          :disabled="isInstalling || isDownloading"
          @click="dismissUpdate"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M9 3L3 9M3 3l6 6"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
      <div class="version-divider"></div>
      <div v-if="isDownloading || isInstalling || isRestarting" class="version-progress-area">
        <div class="version-progress-header">
          <span class="version-progress-label">{{ progressLabel }}</span>
          <span v-if="isDownloading && downloadPercent !== null" class="version-progress-percent">
            {{ downloadPercent }}%
          </span>
        </div>
        <div class="version-progress-track">
          <div :class="['version-progress-fill', progressBarClass]" :style="progressBarStyle" />
        </div>
      </div>
      <div class="version-card-footer">
        <button
          class="skip-button"
          :disabled="isInstalling || isDownloading || isRestarting"
          @click="skipUpdate"
        >
          {{ $t('version.skip') }}
        </button>
        <div class="action-buttons">
          <Button
            variant="outline"
            size="sm"
            class="version-action-button outline"
            :disabled="isInstalling || isDownloading || isRestarting"
            @click="dismissUpdate"
          >
            {{ $t('version.later') }}
          </Button>
          <Button
            variant="default"
            size="sm"
            class="version-action-button primary"
            :disabled="isInstalling || isDownloading || isRestarting"
            @click="downloadAndInstall"
          >
            {{ installButtonLabel }}
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useAppUpdater } from '@/composables';
import { Button } from '@/components/ui/button';
import { lang } from '@/lang';

const {
  updateAvailable,
  updateInfo,
  isDownloading,
  downloadPercent,
  isInstalling,
  isRestarting,
  checkForUpdates,
  downloadAndInstall,
  skipUpdate,
  dismissUpdate,
} = useAppUpdater();

const installButtonLabel = computed(() => {
  if (isRestarting.value) return lang.global.t('version.restarting');
  if (downloadPercent.value !== null)
    return lang.global.t('version.downloading', { percent: downloadPercent.value });
  if (isDownloading.value) return lang.global.t('version.downloadingIndeterminate');
  if (isInstalling.value) return lang.global.t('version.installing');
  return lang.global.t('version.updateNow');
});

const progressLabel = computed(() => {
  if (isRestarting.value) return lang.global.t('version.restarting');
  if (isInstalling.value) return lang.global.t('version.installing');
  return lang.global.t('version.downloadingIndeterminate');
});

const progressBarClass = computed(() => {
  if (isInstalling.value || isRestarting.value) return 'indeterminate';
  if (isDownloading.value && downloadPercent.value === null) return 'indeterminate';
  return '';
});

const progressBarStyle = computed(() => {
  if (progressBarClass.value === 'indeterminate') return {};
  return { width: `${downloadPercent.value ?? 0}%` };
});

onMounted(() => {
  checkForUpdates();
});
</script>

<style scoped>
.version-detect-container {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 1000;
}

.version-card {
  width: 420px;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.version-card-header {
  display: flex;
  align-items: flex-start;
  padding: 20px 20px 16px;
  gap: 12px;
}

.version-icon {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: #eaf7ee;
  border: 1px solid #cfead7;
}

.version-icon-svg {
  color: #22a559;
}

.version-text {
  flex: 1;
  min-width: 0;
}

.version-title {
  font-weight: 700;
  font-size: 16px;
  color: hsl(var(--foreground));
  margin-bottom: 4px;
}

.version-message {
  font-size: 13px;
  color: #8b94a1;
}

.close-button {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  border-radius: 8px;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.close-button:hover {
  background-color: hsl(var(--accent));
  color: hsl(var(--foreground));
}

.close-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.version-divider {
  height: 1px;
  background: #eef1f4;
}

.version-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.skip-button {
  padding: 0;
  border: none;
  background: transparent;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  font-weight: 500;
  transition: color 0.2s;
}

.skip-button:hover {
  color: hsl(var(--foreground));
}

.skip-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.version-action-button {
  min-width: 96px;
  height: 32px;
  padding: 0 14px;
  border-radius: 10px;
  font-weight: 600;
}

.version-action-button.outline {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
  box-shadow: none;
  outline: none;
}

.version-action-button.outline:focus-visible {
  outline: 2px solid #e5e7eb;
  outline-offset: 2px;
}

.version-action-button.primary {
  background: #27ae60;
  border: 1px solid #219653;
  color: #ffffff;
  box-shadow: 0 6px 12px rgba(39, 174, 96, 0.24);
}

.version-action-button.primary:hover {
  background: #239a56;
  border-color: #1f8d4f;
}

.version-progress-area {
  padding: 12px 20px 4px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.version-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.version-progress-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  font-weight: 500;
}

.version-progress-percent {
  font-size: 12px;
  font-weight: 600;
  color: #27ae60;
}

.version-progress-track {
  width: 100%;
  height: 5px;
  border-radius: 999px;
  background: hsl(var(--secondary));
  overflow: hidden;
}

.version-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: #27ae60;
  transition: width 0.3s ease;
}

.version-progress-fill.indeterminate {
  width: 40%;
  animation: progress-slide 1.4s ease-in-out infinite;
}

@keyframes progress-slide {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(350%);
  }
}
</style>
