<template>
  <div class="about-us max-w-3xl space-y-6">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold">About Us</h1>
      <p class="text-muted-foreground">Learn more about DocKit</p>
    </div>

    <Card>
      <CardHeader>
        <div class="flex items-center justify-between">
          <div>
            <CardTitle>DocKit {{ version }}</CardTitle>
            <CardDescription class="mt-1.5">
              DocKit is a modern cross-platform NoSQL/NewSQL GUI client. Explore your data any time
              from your Mac, Windows, and Linux.
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
        <CardTitle>Features</CardTitle>
      </CardHeader>
      <CardContent class="space-y-3">
        <div class="flex gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
          <p class="text-sm">
            Full-featured editor, powered by monaco-editor, the backbone of VSCode, providing a
            familiar editor environment for developers.
          </p>
        </div>
        <div class="flex gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
          <p class="text-sm">
            Keep your connections in desktop apps, moving the dependencies of dashboard tools.
          </p>
        </div>
        <div class="flex gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
          <p class="text-sm">
            File persistence, allowing you to save your code in your machine as a file, never lost.
          </p>
        </div>
        <div class="flex gap-3">
          <div class="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0"></div>
          <p class="text-sm">
            Supports multiple engines including Elasticsearch, OpenSearch, and more to come.
          </p>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader>
        <CardTitle>License</CardTitle>
        <CardDescription>
          DocKit is an open-source project under the Apache 2.0 License.
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

const version = ref('');
const { isChecking, checkForUpdates } = useAppUpdater();

onMounted(async () => {
  const ver = await getVersion();
  version.value = `v${ver}`;
});
</script>

<style scoped></style>
