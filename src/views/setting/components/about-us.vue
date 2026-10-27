<template>
  <div class="about-us max-w-3xl space-y-6">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold">{{ $t('setting.about') }}</h1>
      <p class="text-muted-foreground">{{ $t('setting.aboutUs.tagline') }}</p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>DocKit {{ version }}</CardTitle>
            <CardDescription class="mt-1.5">
              {{ $t('setting.aboutUs.description') }}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="isChecking"
            class="shrink-0 ml-4"
            @click="checkForUpdates(true)"
          >
            <svg
              v-if="isChecking"
              class="animate-spin mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {{ $t('version.checkForUpdates') }}
          </Button>
        </div>
      </CardHeader>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ $t('setting.aboutUs.features') }}</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div v-for="feature in features" :key="feature" class="flex gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
          <p class="text-sm">
            {{ $t(`setting.aboutUs.${feature}`) }}
          </p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>{{ $t('setting.aboutUs.license') }}</CardTitle>
        <CardDescription>
          {{ $t('setting.aboutUs.licenseDesc') }}
        </CardDescription>
      </CardHeader>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getVersion } from '@tauri-apps/api/app';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAppUpdater } from '@/composables';

const features = ['feature1', 'feature2', 'feature3', 'feature4'];
const version = ref('');
const { isChecking, checkForUpdates } = useAppUpdater();

onMounted(async () => {
  const ver = await getVersion();
  version.value = `v${ver}`;
});
</script>

<style scoped></style>
