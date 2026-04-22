<template>
  <Dialog v-model:open="showModal">
    <DialogContent class="sm:max-w-[800px]">
      <DialogHeader>
        <DialogTitle>{{ $t('manage.index.newTemplateForm.title') }}</DialogTitle>
      </DialogHeader>

      <Form class="mt-4">
        <div class="form-grid">
          <!-- Row 1: Template Name -->
          <div class="form-row-full">
            <FormItem :label="$t('manage.index.newTemplateForm.templateName')" required>
              <Input
                v-model="formData.name"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
                :placeholder="$t('manage.index.newTemplateForm.templateName')"
              />
              <p v-if="errors.name" class="text-sm text-destructive mt-1">
                {{ errors.name }}
              </p>
            </FormItem>
          </div>

          <!-- Row 2: Type | master_timeout | Fail if exists (each 1/3) -->
          <div class="form-row-third">
            <div v-if="supportsComponentTemplates" class="form-col-third">
              <FormItem label="Type">
                <Select v-model="templateType">
                  <SelectTrigger>
                    <SelectValue :placeholder="$t('manage.index.newTemplateForm.selectType')" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="TemplateType.INDEX_TEMPLATE">
                      {{ $t('manage.index.newTemplateForm.indexTemplate') }}
                    </SelectItem>
                    <SelectItem :value="TemplateType.COMPONENT_TEMPLATE">
                      {{ $t('manage.index.newTemplateForm.componentTemplate') }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </FormItem>
            </div>
            <div class="form-col-third">
              <FormItem :label="precedenceLabel">
                <InputNumber v-model="formData.precedence" class="flex-1" />
                <p class="text-xs text-muted-foreground mt-1">
                  {{
                    $t('manage.index.newTemplateForm.precedenceDesc', { field: precedenceLabel })
                  }}
                </p>
              </FormItem>
            </div>
            <div class="form-col-third">
              <FormItem label="master_timeout">
                <div class="flex items-center gap-2">
                  <InputNumber v-model="formData.master_timeout" class="flex-1" />
                  <span class="text-sm text-muted-foreground">s</span>
                </div>
              </FormItem>
            </div>
            <div class="form-col-third">
              <FormItem :label="$t('manage.index.newTemplateForm.failIfExists')">
                <Switch v-model:checked="formData.create" />
                <p class="text-xs text-muted-foreground mt-1">
                  {{ $t('manage.index.newTemplateForm.failIfExistsDesc') }}
                </p>
              </FormItem>
            </div>
          </div>

          <!-- Row 3: Body -->
          <div class="form-row-full">
            <FormItem label="body" required>
              <textarea
                v-model="formData.body"
                class="textarea-input"
                placeholder="Enter JSON body"
              />
              <p v-if="errors.body" class="text-sm text-destructive mt-1">
                {{ errors.body }}
              </p>
            </FormItem>
          </div>
        </div>
      </Form>

      <DialogFooter>
        <Button variant="outline" @click="closeModal">{{ $t('dialogOps.cancel') }}</Button>
        <Button :disabled="createLoading" @click="submitCreate">
          <Loader2 v-if="createLoading" class="mr-2 h-4 w-4 animate-spin" />
          {{ $t('dialogOps.create') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { useMessageService, useDialogService } from '@/composables';
import { storeToRefs } from 'pinia';
import { Loader2 } from 'lucide-vue-next';
import { CustomError, jsonify, withLoadingDelay } from '../../../common';
import { useClusterManageStore } from '../../../store';
import { useLang } from '../../../lang';
import { TemplateApiMode, TemplateType } from '../../../datasources';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputNumber } from '@/components/ui/input-number';
import { Form, FormItem } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const clusterManageStore = useClusterManageStore();
const { createTemplate, refreshStates } = clusterManageStore;
const { templates, templateApiMode } = storeToRefs(clusterManageStore);

const lang = useLang();
const message = useMessageService();
const dialog = useDialogService();

const showModal = ref(false);
const createLoading = ref(false);

const templateType = ref(TemplateType.INDEX_TEMPLATE);

const defaultFormData = {
  name: '',
  create: undefined as boolean | undefined,
  precedence: null as number | null,
  master_timeout: null as number | null,
  body: '',
};

type TemplateFormData = {
  name: string;
  create?: boolean;
  precedence: number | null;
  master_timeout: number | null;
  body: string;
};

const formData = ref<TemplateFormData>({ ...defaultFormData });

const errors = ref<{ name?: string; body?: string }>({});

const supportsComponentTemplates = computed(() => {
  return templateApiMode.value === TemplateApiMode.COMPOSABLE;
});

const precedenceLabel = computed(() => {
  return templateApiMode.value === TemplateApiMode.LEGACY
    ? lang.t('manage.index.newTemplateForm.orderLabel')
    : lang.t('manage.index.newTemplateForm.priorityLabel');
});

watch(
  supportsComponentTemplates,
  supports => {
    if (!supports) {
      templateType.value = TemplateType.INDEX_TEMPLATE;
    }
  },
  { immediate: true },
);

watch(
  formData,
  () => {
    errors.value = validateForm(formData.value);
  },
  { deep: true },
);

const isValidJson = (value: string): boolean => {
  if (!value) return false;
  try {
    jsonify.parse(value);
    return true;
  } catch {
    return false;
  }
};

const validateForm = (data: TemplateFormData): { name?: string; body?: string } => {
  const result: { name?: string; body?: string } = {};

  if (!data.name?.trim()) {
    result.name = lang.t('manage.index.newTemplateForm.templateRequired');
  }

  if (!data.body?.trim()) {
    result.body = lang.t('manage.index.newTemplateForm.bodyJsonRequired');
  } else if (!isValidJson(data.body)) {
    result.body = lang.t('manage.index.newTemplateForm.bodyJsonRequired');
  }

  return result;
};

const getTemplatePrecedence = (bodyJson: Record<string, unknown>): number => {
  const precedenceField =
    templateApiMode.value === TemplateApiMode.LEGACY ? bodyJson.order : bodyJson.priority;
  return (precedenceField as number | undefined) ?? 0;
};

const getPatternPrefix = (pattern: string): string => {
  const wildcardIndex = pattern.indexOf('*');
  return wildcardIndex > 0 ? pattern.slice(0, wildcardIndex) : pattern;
};

const patternsOverlap = (patterns1: string[], patterns2: string[]): boolean => {
  for (const p1 of patterns1) {
    const prefix1 = getPatternPrefix(p1);
    for (const p2 of patterns2) {
      const prefix2 = getPatternPrefix(p2);
      if (prefix1 && prefix2 && (prefix1.startsWith(prefix2) || prefix2.startsWith(prefix1))) {
        return true;
      }
    }
  }
  return false;
};

const checkTemplateConflict = (
  bodyJson: Record<string, unknown>,
): { hasConflict: boolean; conflicts: string[] } => {
  if (templateType.value !== TemplateType.INDEX_TEMPLATE) {
    return { hasConflict: false, conflicts: [] };
  }

  const newIndexPatterns = (bodyJson.index_patterns as string[] | undefined) || [];
  const newPriority = getTemplatePrecedence(bodyJson);

  if (newIndexPatterns.length === 0) {
    return { hasConflict: false, conflicts: [] };
  }

  const conflicts: string[] = [];

  for (const template of templates.value) {
    if (template.type !== TemplateType.INDEX_TEMPLATE) continue;

    if (template.name === formData.value.name) continue;

    const existingPatterns = template.index_patterns || [];
    const existingPriority = template.precedence ?? 0;

    if (existingPatterns.length > 0 && existingPriority === newPriority) {
      if (patternsOverlap(newIndexPatterns, existingPatterns)) {
        conflicts.push(
          `${template.name} (patterns: ${existingPatterns.join(', ')}, ${precedenceLabel.value}: ${existingPriority})`,
        );
      }
    }
  }

  return { hasConflict: conflicts.length > 0, conflicts };
};

const toggleModal = () => {
  if (showModal.value) {
    closeModal();
  } else {
    showModal.value = true;
  }
};

const closeModal = () => {
  showModal.value = false;
  templateType.value = TemplateType.INDEX_TEMPLATE;
  formData.value = { ...defaultFormData };
  errors.value = {};
};

const buildTemplateBody = () => {
  const parsedBody = jsonify.parse(formData.value.body) as Record<string, unknown>;
  const precedenceKey = templateApiMode.value === TemplateApiMode.LEGACY ? 'order' : 'priority';
  const incompatibleKey = templateApiMode.value === TemplateApiMode.LEGACY ? 'priority' : 'order';

  const { [incompatibleKey]: _, ...bodyWithoutIncompatible } = parsedBody;

  return jsonify.stringify({
    ...bodyWithoutIncompatible,
    ...(formData.value.precedence !== null ? { [precedenceKey]: formData.value.precedence } : {}),
  });
};

const submitCreate = async (event: MouseEvent) => {
  event.preventDefault();

  const currentErrors = validateForm(formData.value);
  errors.value = currentErrors;

  if (Object.keys(currentErrors).length > 0) {
    return;
  }

  const bodyJson = jsonify.parse(buildTemplateBody()) as Record<string, unknown>;
  const { hasConflict, conflicts } = checkTemplateConflict(bodyJson);

  if (hasConflict) {
    dialog.warning({
      title: lang.t('manage.index.newTemplateForm.conflictWarning'),
      content: lang.t('manage.index.newTemplateForm.conflictDesc') + '\n\n' + conflicts.join('\n'),
      positiveText: lang.t('dialogOps.confirm'),
      negativeText: lang.t('dialogOps.cancel'),
      onPositiveClick: async () => {
        await doCreateTemplate();
      },
    });
  } else {
    await doCreateTemplate();
  }
};

const doCreateTemplate = async () => {
  createLoading.value = true;
  try {
    await withLoadingDelay(
      createTemplate({
        name: formData.value.name,
        create: formData.value.create,
        master_timeout: formData.value.master_timeout,
        type: supportsComponentTemplates.value ? templateType.value : TemplateType.INDEX_TEMPLATE,
        body: buildTemplateBody(),
      }),
    );
    message.success(lang.t('dialogOps.createSuccess'));
    await refreshStates();
    closeModal();
  } catch (err) {
    message.error((err as CustomError).details, {
      closable: true,
      keepAliveOnHover: true,
      duration: 7200,
    });
  } finally {
    createLoading.value = false;
  }
};

defineExpose({ toggleModal });
</script>

<style scoped>
.form-grid {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-row-full {
  width: 100%;
}

.form-row-third {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.form-col-third {
  min-width: 0;
}

.textarea-input {
  display: flex;
  min-height: 200px;
  max-height: 300px;
  width: 100%;
  border-radius: 0.375rem;
  border: 1px solid hsl(var(--input));
  background-color: hsl(var(--background));
  padding: 0.5rem 0.75rem;
  font-size: 0.875rem;
  line-height: 1.25rem;
  resize: vertical;
}

.textarea-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--ring));
}

.textarea-input:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.textarea-input::placeholder {
  color: hsl(var(--muted-foreground));
}
</style>
