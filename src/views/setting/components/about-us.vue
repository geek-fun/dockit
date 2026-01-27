<template>
  <div class="about-us max-w-3xl space-y-6">
    <div class="space-y-2">
      <h1 class="text-3xl font-bold">About Us</h1>
      <p class="text-muted-foreground">Learn more about DocKit</p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle>DocKit</CardTitle>
        <CardDescription>
          DocKit is a modern cross-platform NoSQL/NewSQL GUI client. Explore your data any time from
          your Mac, Windows, and Linux.
        </CardDescription>
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
</script>

<style scoped></style>
