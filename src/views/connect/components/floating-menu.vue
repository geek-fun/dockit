<template>
  <div
    class="floating-menu-container"
    @mouseenter="handleMouseEnter"
    @mouseleave="handleMouseLeave"
  >
    <!-- Secondary buttons (database type options) -->
    <Transition>
      <div v-if="isExpanded" class="secondary-buttons">
        <Transition v-for="(db, index) in databaseTypes" :key="db.value" name="stagger" appear>
          <div v-show="isExpanded" class="secondary-button-wrapper">
            <TooltipProvider :delay-duration="200">
              <Tooltip>
                <TooltipTrigger as-child>
                  <Button
                    variant="default"
                    size="icon"
                    class="secondary-button"
                    :style="{
                      '--enter-delay': `${(databaseTypes.length - 1 - index) * 80}ms`,
                      '--leave-delay': `${index * 80}ms`,
                    }"
                    @click="handleSelect(db.value)"
                  >
                    <component :is="db.icon" class="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  {{ db.label }}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </Transition>
      </div>
    </Transition>

    <!-- Main FAB -->
    <Button class="floating-button" variant="default" size="icon" @click="handleFabClick">
      <span :class="isExpanded ? 'i-carbon-close' : 'i-carbon-add'" class="h-8 w-8" />
    </Button>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DatabaseType } from '@/store';
import elasticsearch from '../../../assets/svg/elasticsearch.svg';
import opensearch from '../../../assets/svg/db-opensearch.svg';
import easysearch from '../../../assets/svg/easysearch.svg';
import dynamoDB from '../../../assets/svg/dynamoDB.svg';
import mongodb from '../../../assets/svg/mongodb.svg';

const emit = defineEmits(['select']);

const isExpanded = ref(false);
let collapseTimeout: ReturnType<typeof setTimeout> | null = null;

const databaseTypes = [
  { value: DatabaseType.ELASTICSEARCH, icon: elasticsearch, label: 'Elasticsearch' },
  { value: DatabaseType.OPENSEARCH, icon: opensearch, label: 'OpenSearch' },
  { value: DatabaseType.EASYSEARCH, icon: easysearch, label: 'EasySearch' },
  { value: DatabaseType.DYNAMODB, icon: dynamoDB, label: 'DynamoDB' },
  { value: DatabaseType.MONGODB, icon: mongodb, label: 'MongoDB' },
];

const handleMouseEnter = () => {
  if (collapseTimeout) {
    clearTimeout(collapseTimeout);
    collapseTimeout = null;
  }
  isExpanded.value = true;
};

const handleMouseLeave = () => {
  collapseTimeout = setTimeout(() => {
    isExpanded.value = false;
  }, 300);
};

const handleFabClick = () => {
  if (isExpanded.value) {
    isExpanded.value = false;
    if (collapseTimeout) {
      clearTimeout(collapseTimeout);
      collapseTimeout = null;
    }
  } else {
    isExpanded.value = true;
  }
};

const handleSelect = (type: DatabaseType) => {
  isExpanded.value = false;
  emit('select', type);
};

onUnmounted(() => {
  if (collapseTimeout) {
    clearTimeout(collapseTimeout);
  }
});
</script>

<style scoped>
.floating-menu-container {
  position: fixed;
  bottom: 40px;
  right: 80px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.secondary-buttons {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.secondary-button-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
}

.secondary-button {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease,
    opacity 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.secondary-button:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  background: hsl(var(--muted));
}

.secondary-button:active {
  transform: scale(0.95);
}

/* Staggered animation for secondary buttons */
/* Enter: bottom to top (last item first) */
.stagger-enter-active {
  animation: stagger-fade-in 0.25s ease-out;
  animation-delay: var(--enter-delay);
}

/* Leave: top to bottom (first item first) */
.stagger-leave-active {
  animation: stagger-fade-out 0.15s ease-in;
  animation-delay: var(--leave-delay);
}

@keyframes stagger-fade-in {
  from {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes stagger-fade-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.8) translateY(10px);
  }
}

/* Container transition - duration must accommodate staggered children */
.v-enter-active {
  transition: opacity 0.1s ease;
}

.v-leave-active {
  transition: opacity 0.3s ease;
}

.v-enter-from,
.v-leave-to {
  opacity: 0;
}

.floating-button {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.floating-button:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
}

.floating-button:active {
  transform: scale(0.95);
}
</style>
