<template>
  <div class="flex flex-wrap justify-around gap-4 mb-6">
    <Card
      class="mt-3 max-w-[300px] max-h-[300px] w-full cluster-cluster-box"
      :class="{
        'text-primary': props.cluster?.status == 'green',
        'text-[hsl(var(--method-put))]': props.cluster?.status == 'yellow',
        'text-destructive': props.cluster?.status == 'red',
      }"
    >
      <CardContent class="p-6 flex flex-col gap-2">
        <p class="text-2xl font-bold m-0 flex items-center gap-2">
          <span>{{ $t('manage.cluster') }}</span>
          <span
            v-if="props.cluster?.status == 'green'"
            class="i-carbon-checkmark-outline h-6 w-6"
          />
          <span
            v-else-if="props.cluster?.status == 'yellow'"
            class="i-carbon-warning-alt h-6 w-6"
          />
          <span
            v-else-if="props.cluster?.status == 'red'"
            class="i-carbon-misuse-outline h-6 w-6"
          />
        </p>
        <p class="m-0">name: {{ props.cluster?.cluster_name }}</p>
        <p class="m-0">id: {{ props.cluster?.cluster_uuid }}</p>
        <p class="m-0">version: {{ props.cluster?.nodes.versions }}</p>
      </CardContent>
    </Card>
    <Card class="mt-3 max-w-[300px] max-h-[300px] w-full text-primary">
      <CardContent class="p-6 flex flex-col gap-2">
        <p class="text-2xl font-bold m-0">
          {{ $t('manage.nodes') }}: {{ props.cluster?.nodes.count.total }}
        </p>
        <p class="m-0 text-foreground">master: {{ props.cluster?.nodes.count.master }}</p>
        <p class="m-0 text-foreground">data: {{ props.cluster?.nodes.count.data }}</p>
      </CardContent>
    </Card>
    <Card class="mt-3 max-w-[300px] max-h-[300px] w-full text-primary">
      <CardContent class="p-6 flex flex-col gap-2">
        <p class="text-2xl font-bold m-0">
          {{ $t('manage.shards') }}: {{ props.cluster?.indices.shards.total }}
        </p>
        <p class="m-0 text-foreground">primaries: {{ props.cluster?.indices.shards.primaries }}</p>
        <p class="m-0 text-foreground">
          replicas:
          {{
            (props.cluster?.indices?.shards?.total || 0) -
            (props.cluster?.indices.shards?.primaries || 0)
          }}
        </p>
      </CardContent>
    </Card>
    <Card class="mt-3 max-w-[300px] max-h-[300px] w-full text-primary">
      <CardContent class="p-6 flex flex-col gap-2">
        <p class="text-2xl font-bold m-0">
          {{ $t('manage.indices') }}: {{ props.cluster?.indices.count }}
        </p>
        <p class="m-0 text-foreground">docs: {{ props.cluster?.indices.docs.count }}</p>
        <p class="m-0 text-foreground">
          size: {{ prettyBytes(props.cluster?.indices.store.size_in_bytes || 0) }}
        </p>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import prettyBytes from 'pretty-bytes';
import { RawClusterStats } from '../../../store';
import { Card, CardContent } from '@/components/ui/card';

const props = defineProps<{ cluster: RawClusterStats | undefined }>();
</script>

<style scoped></style>
