<template>
  <div class="aurora-bg" aria-hidden="true">
    <div class="aurora-blob aurora-blob--a" />
    <div class="aurora-blob aurora-blob--b" />
    <div class="aurora-blob aurora-blob--c" />
  </div>
</template>

<style scoped>
.aurora-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.aurora-blob {
  position: absolute;
  width: 46vmax;
  height: 46vmax;
  border-radius: 50%;
  will-change: transform;
}

.aurora-blob--a {
  top: -18%;
  left: -12%;
  background: radial-gradient(circle, hsl(152 62% 45% / 0.32), transparent 68%);
  animation: aurora-drift-a 26s ease-in-out infinite alternate;
}

.aurora-blob--b {
  top: 8%;
  right: -18%;
  background: radial-gradient(circle, hsl(190 75% 52% / 0.22), transparent 68%);
  animation: aurora-drift-b 32s ease-in-out infinite alternate;
}

.aurora-blob--c {
  bottom: -26%;
  left: 24%;
  background: radial-gradient(circle, hsl(262 45% 58% / 0.18), transparent 68%);
  animation: aurora-drift-c 38s ease-in-out infinite alternate;
}

[theme='dark'] .aurora-blob--a {
  background: radial-gradient(circle, hsl(152 62% 38% / 0.26), transparent 68%);
}

[theme='dark'] .aurora-blob--b {
  background: radial-gradient(circle, hsl(190 70% 42% / 0.18), transparent 68%);
}

[theme='dark'] .aurora-blob--c {
  background: radial-gradient(circle, hsl(262 45% 48% / 0.15), transparent 68%);
}

@keyframes aurora-drift-a {
  from {
    transform: translate3d(0, 0, 0) scale(1);
  }
  to {
    transform: translate3d(9%, 12%, 0) scale(1.15);
  }
}

@keyframes aurora-drift-b {
  from {
    transform: translate3d(0, 0, 0) scale(1.1);
  }
  to {
    transform: translate3d(-11%, 9%, 0) scale(0.95);
  }
}

@keyframes aurora-drift-c {
  from {
    transform: translate3d(0, 0, 0) scale(0.95);
  }
  to {
    transform: translate3d(-8%, -10%, 0) scale(1.12);
  }
}

@media (prefers-reduced-motion: reduce) {
  .aurora-blob {
    animation: none;
  }
}
</style>
