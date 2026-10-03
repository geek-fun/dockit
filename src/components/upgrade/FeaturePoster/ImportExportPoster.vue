<template>
  <div class="poster" aria-hidden="true">
    <div class="poster__bar">
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__dot" />
      <span class="poster__pill">{{ $t('importExport.import') }}</span>
      <span class="poster__model">NDJSON · CSV</span>
    </div>

    <div class="poster__body">
      <div class="p-wizard">
        <div class="p-steps">
          <div class="p-seg">
            <span class="p-seg-item p-seg-item--active">{{ $t('importExport.import') }}</span>
            <span class="p-seg-item">{{ $t('importExport.export') }}</span>
          </div>

          <div class="p-step">
            <div class="p-step-head">
              <Database class="p-step-ic" />
              <span class="p-step-title">{{ $t('import.targetOutput') }}</span>
              <span class="p-step-badge">STEP 01</span>
            </div>
            <div class="p-fields">
              <div class="p-field">
                <span class="p-field-label">{{ $t('import.targetDatabase') }}</span>
                <span class="p-field-value">local-mongodb</span>
              </div>
              <div class="p-field">
                <span class="p-field-label">{{ $t('import.importDatabase') }}</span>
                <span class="p-field-value">geekfun</span>
              </div>
              <div class="p-field">
                <span class="p-field-label">{{ $t('import.collectionName') }}</span>
                <span class="p-field-value">users</span>
              </div>
            </div>
            <div class="p-indicator">
              <span class="p-indicator-badge">{{ $t('import.newCollection') }}</span>
              <span class="p-indicator-text">{{ $t('import.metadataRequired') }}</span>
            </div>
          </div>

          <div class="p-step">
            <div class="p-step-head">
              <FileText class="p-step-ic" />
              <span class="p-step-title">{{ $t('import.sourceScope') }}</span>
              <span class="p-step-badge">STEP 02</span>
            </div>
            <div class="p-dropzone">
              <FileJson class="p-dropzone-icon" />
              <span class="p-dropzone-name">users-2026.ndjson</span>
              <span class="p-dropzone-size">18.4 MB</span>
            </div>
          </div>

          <div class="p-step">
            <div class="p-step-head">
              <ListTree class="p-step-ic" />
              <span class="p-step-title">{{ $t('import.schemaStructure') }}</span>
              <span class="p-step-badge">STEP 03</span>
            </div>
            <div class="p-schema-row">
              <CheckCircle class="p-schema-check" />
              <span>{{ $t('plan.poster.importExport.autoDetected') }}</span>
            </div>
          </div>
        </div>

        <div class="p-panel">
          <div class="p-panel-head">
            <Zap class="p-panel-ic" />
            <span class="p-panel-title">{{ $t('export.execution') }}</span>
          </div>
          <div class="p-valid">
            <div class="p-valid-head">
              <span>{{ $t('export.validationReadiness') }}</span>
              <b>100% {{ $t('export.pass') }}</b>
            </div>
            <div class="p-valid-track">
              <i style="width: 100%" />
            </div>
            <div class="p-valid-rows">
              <div class="p-valid-row">
                <span>{{ $t('import.rowsDetected') }}</span>
                <b>38,000</b>
              </div>
              <div class="p-valid-row">
                <span>{{ $t('import.estimatedDuration') }}</span>
                <b>~4 min</b>
              </div>
            </div>
          </div>
          <div class="p-strategy">
            <span class="p-strategy-title">{{ $t('import.importStrategy') }}</span>
            <label class="p-radio p-radio--on">
              <i />
              <span class="p-radio-label">{{ $t('import.appendRecords') }}</span>
              <span class="p-radio-desc">{{ $t('import.appendRecordsDesc') }}</span>
            </label>
            <label class="p-radio">
              <i />
              <span class="p-radio-label">{{ $t('import.replaceCollection') }}</span>
              <span class="p-radio-desc">{{ $t('import.replaceCollectionDesc') }}</span>
            </label>
          </div>
          <div class="p-phase">
            <RefreshCw class="p-phase-spin" />
            {{ $t('import.phase2Importing') }}
          </div>
          <div class="p-progress">
            <div class="p-valid-track">
              <i class="p-progress-fill" style="width: 64%" />
            </div>
            <p class="p-note">12,400 / 38,000 {{ $t('export.documents') }}</p>
          </div>
          <div class="p-panel-action">
            <span class="p-panel-btn">{{ $t('import.startImportTask') }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="poster__cta">
      <slot name="cta" />
    </div>

    <ProgressiveBlur />
    <div class="poster__lock">
      <Lock class="poster__lock-icon" />
      {{ $t('plan.state.ultimate') }}
    </div>
  </div>
</template>

<script lang="ts" setup>
import {
  CheckCircle,
  Database,
  FileJson,
  FileText,
  ListTree,
  Lock,
  RefreshCw,
  Zap,
} from 'lucide-vue-next';
import { ProgressiveBlur } from '../effects';
</script>

<style scoped>
.poster {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border-radius: 14px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--card));
  box-shadow: 0 24px 64px -20px rgba(0, 0, 0, 0.28);
}

.poster__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}

.poster__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: hsl(var(--border));
}

.poster__pill {
  margin-left: 8px;
  padding: 2px 11px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: hsl(var(--muted-foreground));
}

.poster__model {
  margin-left: auto;
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid hsl(var(--primary) / 0.35);
  color: hsl(var(--primary));
  font-size: 10px;
  font-weight: 600;
}

.poster__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 14px;
  flex: 1;
  flex-direction: column;
  background-color: hsl(var(--background));
}

.p-wizard {
  display: flex;
  flex: 1;
  gap: 12px;
  align-items: stretch;
}

/* ── steps column — mirrors the real segmented control + step cards ── */
.p-steps {
  display: flex;
  flex: 1;
  min-width: 0;
  flex-direction: column;
  gap: 8px;
}

.p-seg {
  display: flex;
  padding: 3px;
  border-radius: 9px;
  border: 1px solid hsl(var(--border));
  background-color: hsl(var(--muted) / 0.5);
}

.p-seg-item {
  flex: 1;
  text-align: center;
  padding: 4px 0;
  border-radius: 7px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.p-seg-item--active {
  background-color: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  color: hsl(var(--foreground));
  font-weight: 600;
}

.p-step {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 10px;
  padding: 10px 12px;
  background-color: hsl(var(--card));
}

.p-step-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 8px;
}

.p-step-ic {
  width: 14px;
  height: 14px;
  color: hsl(var(--method-post));
  flex-shrink: 0;
}

.p-step-title {
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-step-badge {
  margin-left: auto;
  padding: 1px 7px;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  color: hsl(var(--muted-foreground));
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
}

.p-fields {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 6px;
}

.p-field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 7px;
  background-color: hsl(var(--muted) / 0.35);
}

.p-field-label {
  font-size: 8.5px;
  letter-spacing: 0.04em;
  color: hsl(var(--muted-foreground));
}

.p-field-value {
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-indicator {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
}

.p-indicator-badge {
  padding: 1px 8px;
  border-radius: 999px;
  background-color: hsl(var(--method-put) / 0.14);
  color: hsl(var(--method-put));
  font-size: 9px;
  font-weight: 700;
  white-space: nowrap;
}

.p-indicator-text {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-dropzone {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 10px;
  border: 1px dashed hsl(var(--primary) / 0.45);
  border-radius: 8px;
  background-color: hsl(var(--primary) / 0.04);
}

.p-dropzone-icon {
  width: 16px;
  height: 16px;
  color: hsl(var(--primary));
  flex-shrink: 0;
}

.p-dropzone-name {
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.p-dropzone-size {
  margin-left: auto;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.p-schema-row {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.p-schema-check {
  width: 13px;
  height: 13px;
  color: hsl(var(--method-post));
}

.p-panel-ic {
  width: 14px;
  height: 14px;
  color: hsl(var(--method-put));
}

.p-valid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.p-valid-head {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: hsl(var(--foreground));
}

.p-valid-head b {
  color: hsl(var(--method-post));
  font-variant-numeric: tabular-nums;
}

.p-valid-track {
  height: 6px;
  border-radius: 999px;
  background-color: hsl(var(--muted));
  overflow: hidden;
}

.p-valid-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background-color: hsl(var(--method-post) / 0.8);
}

.p-valid-rows {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.p-valid-row {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 9.5px;
  color: hsl(var(--muted-foreground));
}

.p-valid-row b {
  color: hsl(var(--foreground));
  font-variant-numeric: tabular-nums;
}

.p-strategy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.p-strategy-title {
  font-size: 10.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-radio {
  display: grid;
  grid-template-columns: 10px 1fr;
  grid-template-rows: auto auto;
  column-gap: 7px;
  align-items: center;
  padding: 6px 8px;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 7px;
}

.p-radio--on {
  border-color: hsl(var(--primary) / 0.55);
  background-color: hsl(var(--primary) / 0.05);
}

.p-radio i {
  grid-row: 1;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid hsl(var(--border));
}

.p-radio--on i {
  border-color: hsl(var(--primary));
  box-shadow: inset 0 0 0 2px hsl(var(--background));
  background-color: hsl(var(--primary));
}

.p-radio-label {
  font-size: 10px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-radio-desc {
  grid-column: 2;
  font-size: 8.5px;
  color: hsl(var(--muted-foreground));
}

.p-phase {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: 7px;
  background-color: hsl(var(--primary) / 0.08);
  color: hsl(var(--primary));
  font-size: 9.5px;
  font-weight: 600;
}

.p-phase-spin {
  width: 10px;
  height: 10px;
  animation: p-rotate 1.1s linear infinite;
}

.p-progress {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.p-progress-fill {
  background-color: hsl(var(--primary) / 0.7);
  background-image: linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.28) 25%,
    transparent 25%,
    transparent 50%,
    rgba(255, 255, 255, 0.28) 50%,
    rgba(255, 255, 255, 0.28) 75%,
    transparent 75%
  );
  background-size: 12px 12px;
  animation: p-stripes 0.9s linear infinite;
}

.p-panel-action {
  margin-top: auto;
  padding-top: 4px;
}

.p-panel-btn {
  display: block;
  text-align: center;
  padding: 7px 0;
  border-radius: calc(var(--radius) + 1px);
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
  font-size: 11px;
  font-weight: 600;
}

.p-step-head {
  display: flex;
  align-items: center;
  gap: 7px;
}

.p-step-title {
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

/* ── execution panel — mirrors the real execution-container ── */
.p-panel {
  display: flex;
  width: 300px;
  flex-shrink: 0;
  flex-direction: column;
  min-width: 0;
  border: 1px solid hsl(var(--border) / 0.7);
  border-radius: 10px;
  background-color: hsl(var(--card));
  padding: 11px 13px;
  gap: 10px;
}

.p-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.p-panel-title {
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.p-chip {
  margin-left: auto;
  padding: 1px 8px;
  border-radius: 999px;
  background-color: hsl(var(--primary) / 0.12);
  color: hsl(var(--primary));
  font-size: 9.5px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.p-note {
  margin: 0;
  font-size: 9.5px;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.poster__lock {
  position: absolute;
  left: 24px;
  bottom: 24px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 13px;
  border-radius: 999px;
  border: 1px solid hsl(var(--primary) / 0.4);
  background-color: hsl(var(--background) / 0.75);
  backdrop-filter: blur(8px);
  font-size: 11.5px;
  font-weight: 600;
  color: hsl(var(--primary));
}

.poster__lock-icon {
  width: 12px;
  height: 12px;
}

/* ── one-shot scenario: steps fill in → panel validates → import runs ── */
.p-seg {
  animation: p-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.p-step:nth-child(2) {
  animation: p-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
}

.p-step:nth-child(3) {
  animation: p-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 0.75s both;
}

.p-step:nth-child(4) {
  animation: p-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 1.15s both;
}

.p-step-check,
.p-step-running {
  animation: p-pop 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.75s both;
}

.p-step:nth-child(3) .p-step-check {
  animation-delay: 1.55s;
}

.p-step:nth-child(4) .p-step-running {
  animation-delay: 1.95s;
}

.p-panel {
  animation: p-rise 0.5s cubic-bezier(0.22, 1, 0.36, 1) 1.5s both;
}

.p-valid-track i {
  transform-origin: left;
  animation: p-grow 0.7s cubic-bezier(0.22, 1, 0.36, 1) 2s both;
}

.p-progress .p-valid-track i {
  transform: scaleX(0.64);
  animation:
    p-grow-progress 0.9s cubic-bezier(0.22, 1, 0.36, 1) 2.6s both,
    p-stripes 0.9s linear infinite;
}

.p-radio--on {
  animation: p-select 0.35s ease-out 2.9s both;
}

.p-phase {
  animation: p-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) 3.1s both;
}

.p-panel-action .p-panel-btn {
  animation: p-rise 0.45s cubic-bezier(0.22, 1, 0.36, 1) 3.4s both;
}

@keyframes p-rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes p-pop {
  from {
    opacity: 0;
    transform: scale(0.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes p-select {
  from {
    border-color: hsl(var(--border) / 0.7);
    background-color: transparent;
  }
  to {
    border-color: hsl(var(--primary) / 0.55);
    background-color: hsl(var(--primary) / 0.05);
  }
}

@keyframes p-grow {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(1);
  }
}

@keyframes p-grow-progress {
  from {
    transform: scaleX(0);
  }
  to {
    transform: scaleX(0.64);
  }
}

@keyframes p-stripes {
  to {
    background-position: 17px 0;
  }
}

@keyframes p-rotate {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .p-seg,
  .p-step,
  .p-step-check,
  .p-step-running,
  .p-panel,
  .p-valid-track i,
  .p-progress-fill,
  .p-radio--on,
  .p-phase,
  .p-panel-btn {
    animation: none;
  }

  .p-radio--on {
    border-color: hsl(var(--primary) / 0.55);
    background-color: hsl(var(--primary) / 0.05);
  }
}

/* CTA slot: laid out inside the poster's own flex column so the button is
   structurally pinned to the window bottom — immune to containing-block
   resolution and content height changes. */
.poster__cta {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: center;
  padding: 18px 0 20px;
}
/* compact dialog context: stack the wizard */
</style>
