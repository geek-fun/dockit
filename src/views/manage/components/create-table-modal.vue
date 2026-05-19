<template>
  <Dialog :open="props.show" @update:open="val => emit('update:show', val)">
    <DialogContent class="max-w-[700px]">
      <DialogHeader>
        <DialogTitle>{{ lang.t('manage.dynamo.createTableTitle') }}</DialogTitle>
      </DialogHeader>

      <div v-if="resultType === 'success' && resultMessage" class="text-center py-4">
        <div class="text-green-500 text-4xl mb-2">✓</div>
        <p class="text-sm font-medium">{{ lang.t('manage.dynamo.createTableSuccess') }}</p>
      </div>

      <Alert v-else-if="resultMessage && resultType === 'error'" variant="destructive" class="mb-3">
        <AlertDescription class="flex items-center justify-between">
          <span>{{ resultMessage }}</span>
          <button class="ml-2 text-sm hover:opacity-70 cursor-pointer" @click="resultMessage = ''">
            <X class="w-4 h-4" />
          </button>
        </AlertDescription>
      </Alert>

      <div v-else class="wizard-container">
        <div class="step-indicators flex items-center mb-6">
          <template v-for="(step, index) in steps" :key="index">
            <div
              :class="[
                'step-indicator flex items-center gap-2 shrink-0',
                { active: currentStep === index, completed: index < currentStep },
              ]"
            >
              <div
                :class="[
                  'step-circle w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                  currentStep === index
                    ? 'bg-blue-500 text-white'
                    : index < currentStep
                      ? 'bg-green-500 text-white'
                      : 'bg-muted text-muted-foreground',
                ]"
              >
                {{ index < currentStep ? '✓' : index + 1 }}
              </div>
              <span
                :class="[
                  'step-label text-sm',
                  currentStep === index
                    ? 'font-medium text-foreground'
                    : index < currentStep
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-muted-foreground',
                ]"
              >
                {{ step.label }}
              </span>
            </div>
            <div
              v-if="index < steps.length - 1"
              :class="['flex-1 h-px mx-2', index < currentStep ? 'bg-green-500' : 'bg-border']"
            />
          </template>
        </div>

        <ScrollArea class="h-[45vh] pr-4">
          <Form class="space-y-4">
            <template v-if="currentStep === 0">
              <FormItem
                :label="lang.t('manage.dynamo.tableName')"
                required
                :error="errors.tableName"
              >
                <Input
                  v-model="formValue.tableName"
                  :placeholder="lang.t('manage.dynamo.tableNamePlaceholder')"
                  autocapitalize="off"
                  autocomplete="off"
                  :spellcheck="false"
                  autocorrect="off"
                  @blur="validateTableName"
                />
              </FormItem>

              <FormItem
                :label="lang.t('manage.dynamo.partitionKey')"
                required
                :error="errors.partitionKey"
              >
                <div class="flex gap-2">
                  <Input
                    v-model="formValue.partitionKey.name"
                    :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    class="flex-1"
                  />
                  <Select v-model="formValue.partitionKey.type">
                    <SelectTrigger class="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormItem>

              <FormItem :label="lang.t('manage.dynamo.sortKey')">
                <div class="flex gap-2">
                  <Input
                    v-model="formValue.sortKey.name"
                    :placeholder="lang.t('manage.dynamo.sortKeyPlaceholder')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                    autocorrect="off"
                    class="flex-1"
                  />
                  <Select v-model="formValue.sortKey.type">
                    <SelectTrigger class="w-[100px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="opt in keyTypeOptions" :key="opt.value" :value="opt.value">
                        {{ opt.label }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormItem>

              <Separator />

              <FormItem :label="lang.t('manage.dynamo.tableClass')">
                <div class="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    :class="[
                      'text-left p-3 rounded-lg border-2 transition-colors',
                      formValue.tableClass === 'STANDARD'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/50',
                    ]"
                    @click="formValue.tableClass = 'STANDARD'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <div
                        :class="[
                          'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                          formValue.tableClass === 'STANDARD'
                            ? 'border-primary'
                            : 'border-muted-foreground',
                        ]"
                      >
                        <div
                          v-if="formValue.tableClass === 'STANDARD'"
                          class="w-1.5 h-1.5 rounded-full bg-primary"
                        />
                      </div>
                      <span class="text-sm font-medium">
                        {{ lang.t('manage.dynamo.tableClassStandard') }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground leading-relaxed pl-5">
                      {{ lang.t('manage.dynamo.tableClassStandardDesc') }}
                    </p>
                  </button>
                  <button
                    type="button"
                    :class="[
                      'text-left p-3 rounded-lg border-2 transition-colors',
                      formValue.tableClass === 'STANDARD_INFREQUENT_ACCESS'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/50',
                    ]"
                    @click="formValue.tableClass = 'STANDARD_INFREQUENT_ACCESS'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <div
                        :class="[
                          'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                          formValue.tableClass === 'STANDARD_INFREQUENT_ACCESS'
                            ? 'border-primary'
                            : 'border-muted-foreground',
                        ]"
                      >
                        <div
                          v-if="formValue.tableClass === 'STANDARD_INFREQUENT_ACCESS'"
                          class="w-1.5 h-1.5 rounded-full bg-primary"
                        />
                      </div>
                      <span class="text-sm font-medium">
                        {{ lang.t('manage.dynamo.tableClassIA') }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground leading-relaxed pl-5">
                      {{ lang.t('manage.dynamo.tableClassIADesc') }}
                    </p>
                  </button>
                </div>
              </FormItem>

              <Separator />

              <div>
                <div class="flex justify-between items-center mb-1">
                  <div>
                    <span class="text-sm font-medium">{{ lang.t('manage.dynamo.tags') }}</span>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      {{ lang.t('manage.dynamo.tagsDescription') }}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" type="button" @click="addTag">
                    {{ lang.t('manage.dynamo.addTag') }}
                  </Button>
                </div>

                <div v-if="formValue.tags.length > 0" class="space-y-2 mt-3">
                  <div
                    v-for="(tag, index) in formValue.tags"
                    :key="index"
                    class="flex gap-2 items-center"
                  >
                    <Input
                      v-model="tag.key"
                      :placeholder="lang.t('manage.dynamo.tagKeyPlaceholder')"
                      autocapitalize="off"
                      autocomplete="off"
                      :spellcheck="false"
                      class="flex-1"
                    />
                    <Input
                      v-model="tag.value"
                      :placeholder="lang.t('manage.dynamo.tagValuePlaceholder')"
                      autocapitalize="off"
                      autocomplete="off"
                      :spellcheck="false"
                      class="flex-1"
                    />
                    <Button variant="ghost" size="icon" type="button" @click="removeTag(index)">
                      <span class="i-carbon-trash-can h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>
            </template>

            <template v-else-if="currentStep === 1">
              <FormItem :label="lang.t('manage.dynamo.billingMode')">
                <div class="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    :class="[
                      'billing-option-card text-left p-3 rounded-lg border-2 transition-colors',
                      formValue.billingMode === 'PAY_PER_REQUEST'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/50',
                    ]"
                    @click="formValue.billingMode = 'PAY_PER_REQUEST'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <div
                        :class="[
                          'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                          formValue.billingMode === 'PAY_PER_REQUEST'
                            ? 'border-primary'
                            : 'border-muted-foreground',
                        ]"
                      >
                        <div
                          v-if="formValue.billingMode === 'PAY_PER_REQUEST'"
                          class="w-1.5 h-1.5 rounded-full bg-primary"
                        />
                      </div>
                      <span class="text-sm font-medium">
                        {{ lang.t('manage.dynamo.billingOnDemand') }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground leading-relaxed pl-5">
                      {{ lang.t('manage.dynamo.billingOnDemandDesc') }}
                    </p>
                  </button>
                  <button
                    type="button"
                    :class="[
                      'billing-option-card text-left p-3 rounded-lg border-2 transition-colors',
                      formValue.billingMode === 'PROVISIONED'
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/50',
                    ]"
                    @click="formValue.billingMode = 'PROVISIONED'"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <div
                        :class="[
                          'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                          formValue.billingMode === 'PROVISIONED'
                            ? 'border-primary'
                            : 'border-muted-foreground',
                        ]"
                      >
                        <div
                          v-if="formValue.billingMode === 'PROVISIONED'"
                          class="w-1.5 h-1.5 rounded-full bg-primary"
                        />
                      </div>
                      <span class="text-sm font-medium">
                        {{ lang.t('manage.dynamo.billingProvisioned') }}
                      </span>
                    </div>
                    <p class="text-xs text-muted-foreground leading-relaxed pl-5">
                      {{ lang.t('manage.dynamo.billingProvisionedDesc') }}
                    </p>
                  </button>
                </div>
              </FormItem>

              <template v-if="formValue.billingMode === 'PROVISIONED'">
                <div class="grid grid-cols-2 gap-4">
                  <FormItem
                    :label="lang.t('manage.dynamo.readCapacity')"
                    :error="errors.readCapacity"
                  >
                    <Input
                      v-model.number="formValue.readCapacity"
                      type="number"
                      min="1"
                      :placeholder="'5'"
                    />
                  </FormItem>
                  <FormItem
                    :label="lang.t('manage.dynamo.writeCapacity')"
                    :error="errors.writeCapacity"
                  >
                    <Input
                      v-model.number="formValue.writeCapacity"
                      type="number"
                      min="1"
                      :placeholder="'5'"
                    />
                  </FormItem>
                </div>
              </template>

              <Separator class="my-4" />

              <!-- Encryption -->
              <div class="space-y-2">
                <span class="text-sm font-medium">
                  {{ lang.t('manage.dynamo.encryptionAtRest') }}
                </span>
                <div class="space-y-2 mt-2">
                  <button
                    v-for="opt in encryptionOptions"
                    :key="opt.value"
                    type="button"
                    :class="[
                      'w-full text-left p-3 rounded-lg border-2 transition-colors',
                      formValue.sseSpecification.sseType === opt.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-card hover:border-muted-foreground/50',
                    ]"
                    @click="formValue.sseSpecification.sseType = opt.value"
                  >
                    <div class="flex items-center gap-2">
                      <div
                        :class="[
                          'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                          formValue.sseSpecification.sseType === opt.value
                            ? 'border-primary'
                            : 'border-muted-foreground',
                        ]"
                      >
                        <div
                          v-if="formValue.sseSpecification.sseType === opt.value"
                          class="w-1.5 h-1.5 rounded-full bg-primary"
                        />
                      </div>
                      <span class="text-sm font-medium">{{ opt.label }}</span>
                      <span class="text-xs text-muted-foreground">{{ opt.desc }}</span>
                    </div>
                  </button>
                </div>
                <FormItem
                  v-if="formValue.sseSpecification.sseType === 'KMS'"
                  :label="lang.t('manage.dynamo.kmsMasterKeyId')"
                  class="mt-3"
                >
                  <Input
                    v-model="formValue.sseSpecification.kmsMasterKeyId"
                    :placeholder="lang.t('manage.dynamo.kmsMasterKeyIdPlaceholder')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                  />
                </FormItem>
              </div>

              <Separator class="my-4" />

              <!-- Deletion Protection -->
              <FormItem :label="lang.t('manage.dynamo.deletionProtection')">
                <div class="flex items-center justify-between">
                  <p class="text-xs text-muted-foreground max-w-[80%]">
                    {{ lang.t('manage.dynamo.deletionProtectionDesc') }}
                  </p>
                  <Switch
                    :checked="formValue.deletionProtection"
                    @update:checked="val => (formValue.deletionProtection = val)"
                  />
                </div>
              </FormItem>
            </template>

            <template v-else-if="currentStep === 2">
              <!-- GSI -->
              <div class="flex justify-between items-center mb-3">
                <span class="text-sm font-medium">
                  {{ lang.t('manage.dynamo.globalSecondaryIndexes') }}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  :disabled="gsiDraftOpen"
                  @click="openGsiForm"
                >
                  {{ lang.t('manage.dynamo.addGsi') }}
                </Button>
              </div>

              <!-- GSI draft form -->
              <div
                v-if="gsiDraftOpen"
                class="p-4 border-2 border-primary/40 rounded-lg space-y-3 mb-3 bg-primary/5"
              >
                <FormItem :label="lang.t('manage.dynamo.indexName')">
                  <Input
                    v-model="gsiDraft.indexName"
                    :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                  />
                </FormItem>
                <FormItem :label="lang.t('manage.dynamo.partitionKey')">
                  <div class="flex gap-2">
                    <Input
                      v-model="gsiDraft.partitionKey.name"
                      :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                      autocapitalize="off"
                      autocomplete="off"
                      :spellcheck="false"
                      class="flex-1"
                    />
                    <Select v-model="gsiDraft.partitionKey.type">
                      <SelectTrigger class="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="opt in keyTypeOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FormItem>
                <FormItem :label="lang.t('manage.dynamo.sortKey')">
                  <div class="flex gap-2">
                    <Input
                      v-model="gsiDraft.sortKey.name"
                      :placeholder="lang.t('manage.dynamo.sortKeyPlaceholderCreate')"
                      autocapitalize="off"
                      autocomplete="off"
                      :spellcheck="false"
                      class="flex-1"
                    />
                    <Select v-model="gsiDraft.sortKey.type">
                      <SelectTrigger class="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="opt in keyTypeOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FormItem>
                <FormItem :label="lang.t('manage.dynamo.projectionType')">
                  <Select v-model="gsiDraft.projectionType">
                    <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        {{ lang.t('manage.dynamo.projectionAll') }}
                      </SelectItem>
                      <SelectItem value="KEYS_ONLY">
                        {{ lang.t('manage.dynamo.projectionKeysOnly') }}
                      </SelectItem>
                      <SelectItem value="INCLUDE">
                        {{ lang.t('manage.dynamo.projectionInclude') }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <template v-if="formValue.billingMode === 'PROVISIONED'">
                  <div class="grid grid-cols-2 gap-4">
                    <FormItem :label="lang.t('manage.dynamo.readCapacity')">
                      <Input
                        v-model.number="gsiDraft.readCapacity"
                        type="number"
                        min="1"
                        placeholder="5"
                      />
                    </FormItem>
                    <FormItem :label="lang.t('manage.dynamo.writeCapacity')">
                      <Input
                        v-model.number="gsiDraft.writeCapacity"
                        type="number"
                        min="1"
                        placeholder="5"
                      />
                    </FormItem>
                  </div>
                </template>
                <div class="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" type="button" @click="resetGsiDraft">
                    {{ lang.t('manage.dynamo.reset') }}
                  </Button>
                  <Button variant="default" size="sm" type="button" @click="saveGsi">
                    {{ lang.t('manage.dynamo.save') }}
                  </Button>
                </div>
              </div>

              <!-- GSI saved rows -->
              <div
                v-if="formValue.globalSecondaryIndexes.length === 0 && !gsiDraftOpen"
                class="text-sm text-muted-foreground py-2 mb-3"
              >
                {{ lang.t('manage.dynamo.noIndexes') }}
              </div>
              <div v-else-if="formValue.globalSecondaryIndexes.length > 0" class="space-y-2 mb-3">
                <div
                  v-for="(gsi, index) in formValue.globalSecondaryIndexes"
                  :key="index"
                  class="flex items-start justify-between p-3 border rounded-lg bg-muted/30"
                >
                  <div class="space-y-0.5 text-sm min-w-0">
                    <div class="font-medium truncate">
                      {{ gsi.partitionKey.name }} ({{ gsi.partitionKey.type }})
                      <span v-if="gsi.sortKey.name" class="text-muted-foreground font-normal">
                        · {{ gsi.sortKey.name }} ({{ gsi.sortKey.type }})
                      </span>
                    </div>
                    <div class="text-xs text-muted-foreground truncate">
                      {{ gsi.indexName || '—' }} · {{ gsi.projectionType }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 ml-2 shrink-0">
                    <Button variant="ghost" size="icon" type="button" @click="editGsi(index)">
                      <span class="i-carbon-edit h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" type="button" @click="removeGsi(index)">
                      <span class="i-carbon-trash-can h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator class="my-4" />

              <!-- LSI -->
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium">
                  {{ lang.t('manage.dynamo.localSecondaryIndexes') }}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  :disabled="!formValue.sortKey.name || lsiDraftOpen"
                  @click="openLsiForm"
                >
                  {{ lang.t('manage.dynamo.addLsi') }}
                </Button>
              </div>

              <p v-if="!formValue.sortKey.name" class="text-xs text-muted-foreground mb-3">
                {{ lang.t('manage.dynamo.lsiRequiresSortKey') }}
              </p>

              <!-- LSI draft form -->
              <div
                v-if="lsiDraftOpen"
                class="p-4 border-2 border-primary/40 rounded-lg space-y-3 mb-3 bg-primary/5"
              >
                <FormItem :label="lang.t('manage.dynamo.indexName')">
                  <Input
                    v-model="lsiDraft.indexName"
                    :placeholder="lang.t('manage.dynamo.indexNamePlaceholder')"
                    autocapitalize="off"
                    autocomplete="off"
                    :spellcheck="false"
                  />
                </FormItem>
                <FormItem :label="lang.t('manage.dynamo.sortKey')">
                  <div class="flex gap-2">
                    <Input
                      v-model="lsiDraft.sortKey.name"
                      :placeholder="lang.t('manage.dynamo.keyAttributeName')"
                      autocapitalize="off"
                      autocomplete="off"
                      :spellcheck="false"
                      class="flex-1"
                    />
                    <Select v-model="lsiDraft.sortKey.type">
                      <SelectTrigger class="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="opt in keyTypeOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </FormItem>
                <FormItem :label="lang.t('manage.dynamo.projectionType')">
                  <Select v-model="lsiDraft.projectionType">
                    <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">
                        {{ lang.t('manage.dynamo.projectionAll') }}
                      </SelectItem>
                      <SelectItem value="KEYS_ONLY">
                        {{ lang.t('manage.dynamo.projectionKeysOnly') }}
                      </SelectItem>
                      <SelectItem value="INCLUDE">
                        {{ lang.t('manage.dynamo.projectionInclude') }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
                <div class="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" type="button" @click="resetLsiDraft">
                    {{ lang.t('manage.dynamo.reset') }}
                  </Button>
                  <Button variant="default" size="sm" type="button" @click="saveLsi">
                    {{ lang.t('manage.dynamo.save') }}
                  </Button>
                </div>
              </div>

              <!-- LSI saved rows -->
              <div v-if="formValue.localSecondaryIndexes.length > 0" class="space-y-2 mb-3">
                <div
                  v-for="(lsi, index) in formValue.localSecondaryIndexes"
                  :key="index"
                  class="flex items-start justify-between p-3 border rounded-lg bg-muted/30"
                >
                  <div class="space-y-0.5 text-sm min-w-0">
                    <div class="font-medium truncate">
                      {{ formValue.partitionKey.name }} ({{ formValue.partitionKey.type }})
                      <span v-if="lsi.sortKey.name" class="text-muted-foreground font-normal">
                        · {{ lsi.sortKey.name }} ({{ lsi.sortKey.type }})
                      </span>
                    </div>
                    <div class="text-xs text-muted-foreground truncate">
                      {{ lsi.indexName || '—' }} · {{ lsi.projectionType }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1 ml-2 shrink-0">
                    <Button variant="ghost" size="icon" type="button" @click="editLsi(index)">
                      <span class="i-carbon-edit h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" type="button" @click="removeLsi(index)">
                      <span class="i-carbon-trash-can h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              </div>

              <Separator class="my-4" />

              <div class="stream-section space-y-4">
                <FormItem :label="lang.t('manage.dynamo.enableStreams')">
                  <Switch
                    :checked="formValue.streamSpecification.streamEnabled"
                    @update:checked="val => (formValue.streamSpecification.streamEnabled = val)"
                  />
                </FormItem>

                <FormItem
                  v-if="formValue.streamSpecification.streamEnabled"
                  :label="lang.t('manage.dynamo.streamViewType')"
                >
                  <Select v-model="formValue.streamSpecification.streamViewType">
                    <SelectTrigger class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NEW_AND_OLD_IMAGES">
                        {{ lang.t('manage.dynamo.streamNewAndOld') }}
                      </SelectItem>
                      <SelectItem value="NEW_IMAGE">
                        {{ lang.t('manage.dynamo.streamNewImage') }}
                      </SelectItem>
                      <SelectItem value="OLD_IMAGE">
                        {{ lang.t('manage.dynamo.streamOldImage') }}
                      </SelectItem>
                      <SelectItem value="KEYS_ONLY">
                        {{ lang.t('manage.dynamo.streamKeysOnly') }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </div>
            </template>

            <template v-else-if="currentStep === 3">
              <div class="review-section space-y-3">
                <!-- Basic Info -->
                <div class="review-card rounded-lg border bg-muted/30 overflow-hidden">
                  <div class="px-4 py-2 bg-muted/50 border-b">
                    <span
                      class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {{ lang.t('manage.dynamo.stepBasic') }}
                    </span>
                  </div>
                  <div class="px-4 py-3 space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.tableName') }}
                      </span>
                      <span class="font-medium">{{ formValue.tableName }}</span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.partitionKey') }}
                      </span>
                      <span class="font-medium">
                        {{ formValue.partitionKey.name }} ({{ formValue.partitionKey.type }})
                      </span>
                    </div>
                    <div v-if="formValue.sortKey.name" class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.sortKey') }}
                      </span>
                      <span class="font-medium">
                        {{ formValue.sortKey.name }} ({{ formValue.sortKey.type }})
                      </span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.tableClass') }}
                      </span>
                      <span class="font-medium">
                        {{
                          formValue.tableClass === 'STANDARD'
                            ? lang.t('manage.dynamo.tableClassStandard')
                            : lang.t('manage.dynamo.tableClassIA')
                        }}
                      </span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.enableStreams') }}
                      </span>
                      <span class="font-medium">
                        {{
                          formValue.streamSpecification.streamEnabled
                            ? formValue.streamSpecification.streamViewType
                            : lang.t('manage.dynamo.disabled')
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Capacity -->
                <div class="review-card rounded-lg border bg-muted/30 overflow-hidden">
                  <div class="px-4 py-2 bg-muted/50 border-b">
                    <span
                      class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {{ lang.t('manage.dynamo.stepCapacity') }}
                    </span>
                  </div>
                  <div class="px-4 py-3 space-y-2">
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.billingMode') }}
                      </span>
                      <span class="font-medium">
                        {{
                          formValue.billingMode === 'PAY_PER_REQUEST'
                            ? lang.t('manage.dynamo.billingOnDemand')
                            : lang.t('manage.dynamo.billingProvisioned')
                        }}
                      </span>
                    </div>
                    <template v-if="formValue.billingMode === 'PROVISIONED'">
                      <div class="flex justify-between text-sm">
                        <span class="text-muted-foreground">
                          {{ lang.t('manage.dynamo.readCapacity') }}
                        </span>
                        <span class="font-medium">{{ formValue.readCapacity }}</span>
                      </div>
                      <div class="flex justify-between text-sm">
                        <span class="text-muted-foreground">
                          {{ lang.t('manage.dynamo.writeCapacity') }}
                        </span>
                        <span class="font-medium">{{ formValue.writeCapacity }}</span>
                      </div>
                    </template>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.encryptionAtRest') }}
                      </span>
                      <span class="font-medium">
                        {{
                          formValue.sseSpecification.sseType === 'AWS_OWNED'
                            ? lang.t('manage.dynamo.encryptionAwsOwned')
                            : formValue.sseSpecification.sseType === 'AES256'
                              ? lang.t('manage.dynamo.encryptionAwsManaged')
                              : lang.t('manage.dynamo.encryptionCustomerManaged')
                        }}
                      </span>
                    </div>
                    <div
                      v-if="
                        formValue.sseSpecification.sseType === 'KMS' &&
                        formValue.sseSpecification.kmsMasterKeyId
                      "
                      class="flex justify-between text-sm"
                    >
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.kmsMasterKeyId') }}
                      </span>
                      <span class="font-medium font-mono text-xs truncate max-w-[60%]">
                        {{ formValue.sseSpecification.kmsMasterKeyId }}
                      </span>
                    </div>
                    <div class="flex justify-between text-sm">
                      <span class="text-muted-foreground">
                        {{ lang.t('manage.dynamo.deletionProtection') }}
                      </span>
                      <span
                        :class="
                          formValue.deletionProtection
                            ? 'font-medium text-amber-600 dark:text-amber-400'
                            : 'font-medium text-muted-foreground'
                        "
                      >
                        {{
                          formValue.deletionProtection
                            ? lang.t('manage.dynamo.enabled')
                            : lang.t('manage.dynamo.disabled')
                        }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Secondary Indexes -->
                <div class="review-card rounded-lg border bg-muted/30 overflow-hidden">
                  <div class="px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
                    <span
                      class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {{ lang.t('manage.dynamo.stepIndexes') }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{
                        formValue.globalSecondaryIndexes.length +
                        formValue.localSecondaryIndexes.length
                      }}
                    </span>
                  </div>
                  <div
                    v-if="
                      formValue.globalSecondaryIndexes.length === 0 &&
                      formValue.localSecondaryIndexes.length === 0
                    "
                    class="px-4 py-3 text-sm text-muted-foreground"
                  >
                    {{ lang.t('manage.dynamo.noIndexes') }}
                  </div>
                  <div v-else class="divide-y">
                    <div
                      v-for="(gsi, i) in formValue.globalSecondaryIndexes"
                      :key="'gsi-' + i"
                      class="px-4 py-2 flex items-center gap-3 text-sm"
                    >
                      <span
                        class="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary"
                      >
                        GSI
                      </span>
                      <span class="font-medium truncate">{{ gsi.indexName || '—' }}</span>
                      <span class="text-muted-foreground truncate">
                        {{ gsi.partitionKey.name }} ({{ gsi.partitionKey.type }})
                        <template v-if="gsi.sortKey.name">
                          · {{ gsi.sortKey.name }} ({{ gsi.sortKey.type }})
                        </template>
                      </span>
                      <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                        {{ gsi.projectionType }}
                      </span>
                    </div>
                    <div
                      v-for="(lsi, i) in formValue.localSecondaryIndexes"
                      :key="'lsi-' + i"
                      class="px-4 py-2 flex items-center gap-3 text-sm"
                    >
                      <span
                        class="shrink-0 text-xs font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground"
                      >
                        LSI
                      </span>
                      <span class="font-medium truncate">{{ lsi.indexName || '—' }}</span>
                      <span class="text-muted-foreground truncate">
                        {{ formValue.partitionKey.name }} ({{ formValue.partitionKey.type }}) ·
                        {{ lsi.sortKey.name }} ({{ lsi.sortKey.type }})
                      </span>
                      <span class="ml-auto shrink-0 text-xs text-muted-foreground">
                        {{ lsi.projectionType }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Tags -->
                <div class="review-card rounded-lg border bg-muted/30 overflow-hidden">
                  <div class="px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
                    <span
                      class="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {{ lang.t('manage.dynamo.tagCount') }}
                    </span>
                    <span class="text-xs text-muted-foreground">
                      {{ formValue.tags.filter(t => t.key).length }}
                    </span>
                  </div>
                  <div
                    v-if="!formValue.tags.some(t => t.key)"
                    class="px-4 py-3 text-sm text-muted-foreground"
                  >
                    {{ lang.t('manage.dynamo.noTags') }}
                  </div>
                  <div v-else class="divide-y">
                    <div
                      v-for="(tag, i) in formValue.tags.filter(t => t.key)"
                      :key="i"
                      class="px-4 py-2 flex justify-between text-sm"
                    >
                      <span class="font-mono text-muted-foreground">{{ tag.key }}</span>
                      <span class="font-mono font-medium">{{ tag.value || '—' }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </Form>
        </ScrollArea>
      </div>

      <DialogFooter class="mt-4">
        <Button
          v-if="currentStep > 0 && !resultMessage"
          variant="outline"
          :disabled="loading"
          @click="prevStep"
        >
          {{ lang.t('manage.dynamo.back') }}
        </Button>
        <Button
          v-if="resultType === 'error'"
          variant="destructive"
          :disabled="loading"
          @click="handleRetry"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('dialogOps.retry') }}
        </Button>
        <Button
          v-else-if="currentStep < steps.length - 1 && !resultMessage"
          :disabled="loading || !canProceed"
          @click="nextStep"
        >
          {{ lang.t('manage.dynamo.next') }}
        </Button>
        <Button
          v-else-if="!resultMessage"
          :disabled="loading || !canProceed"
          @click="handleConfirm"
        >
          <Spinner v-if="loading" class="mr-2 h-4 w-4" />
          {{ lang.t('manage.dynamo.createTable') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { ref, watch, computed, reactive } from 'vue';
import { X } from 'lucide-vue-next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Form, FormItem } from '@/components/ui/form';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY } from '../../../common';
import { useLang } from '../../../lang';
import {
  useDynamoManageStore,
  DynamoDBConnection,
  CreateTableConfig,
  DatabaseType,
} from '../../../store';

const lang = useLang();
const dynamoManageStore = useDynamoManageStore();

interface Props {
  show: boolean;
  connection: DynamoDBConnection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'update:show', value: boolean): void;
  (e: 'created', tableName: string): void;
}>();

const steps = [
  { label: lang.t('manage.dynamo.stepBasic'), value: 0 },
  { label: lang.t('manage.dynamo.stepCapacity'), value: 1 },
  { label: lang.t('manage.dynamo.stepIndexes'), value: 2 },
  { label: lang.t('manage.dynamo.stepReview'), value: 3 },
];

const keyTypeOptions = [
  { label: 'String', value: 'S' },
  { label: 'Number', value: 'N' },
  { label: 'Binary', value: 'B' },
];

const encryptionOptions = computed(() => [
  {
    value: 'AWS_OWNED' as const,
    label: lang.t('manage.dynamo.encryptionAwsOwned'),
    desc: lang.t('manage.dynamo.encryptionAwsOwnedDesc'),
  },
  {
    value: 'AES256' as const,
    label: lang.t('manage.dynamo.encryptionAwsManaged'),
    desc: lang.t('manage.dynamo.encryptionAwsManagedDesc'),
  },
  {
    value: 'KMS' as const,
    label: lang.t('manage.dynamo.encryptionCustomerManaged'),
    desc: lang.t('manage.dynamo.encryptionCustomerManagedDesc'),
  },
]);

const currentStep = ref(0);
const loading = ref(false);
const resultMessage = ref('');
const resultType = ref<'success' | 'error'>('success');
const errors = reactive({
  tableName: '',
  partitionKey: '',
  readCapacity: '',
  writeCapacity: '',
});

const formValue = reactive({
  tableName: '',
  tableClass: 'STANDARD' as 'STANDARD' | 'STANDARD_INFREQUENT_ACCESS',
  partitionKey: { name: '', type: 'S' as 'S' | 'N' | 'B' },
  sortKey: { name: '', type: 'S' as 'S' | 'N' | 'B' },
  billingMode: 'PAY_PER_REQUEST' as 'PAY_PER_REQUEST' | 'PROVISIONED',
  readCapacity: 5,
  writeCapacity: 5,
  tags: [] as Array<{ key: string; value: string }>,
  localSecondaryIndexes: [] as Array<{
    indexName: string;
    sortKey: { name: string; type: 'S' | 'N' | 'B' };
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  }>,
  globalSecondaryIndexes: [] as Array<{
    indexName: string;
    partitionKey: { name: string; type: 'S' | 'N' | 'B' };
    sortKey: { name: string; type: 'S' | 'N' | 'B' };
    projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
    readCapacity: number;
    writeCapacity: number;
  }>,
  streamSpecification: {
    streamEnabled: false,
    streamViewType: 'NEW_AND_OLD_IMAGES' as
      | 'KEYS_ONLY'
      | 'NEW_IMAGE'
      | 'OLD_IMAGE'
      | 'NEW_AND_OLD_IMAGES',
  },
  sseSpecification: {
    enabled: false,
    sseType: 'AWS_OWNED' as 'AWS_OWNED' | 'AES256' | 'KMS',
    kmsMasterKeyId: '',
  },
  deletionProtection: false,
});

const canProceed = computed(() => {
  if (currentStep.value === 0) {
    return formValue.tableName.length >= 3 && formValue.partitionKey.name.length > 0;
  }
  if (currentStep.value === 1) {
    if (formValue.billingMode === 'PROVISIONED') {
      return formValue.readCapacity >= 1 && formValue.writeCapacity >= 1;
    }
    return true;
  }
  if (currentStep.value === 2) {
    return true;
  }
  if (currentStep.value === 3) {
    return formValue.tableName.length >= 3 && formValue.partitionKey.name.length > 0;
  }
  return true;
});

watch(
  () => props.show,
  newVal => {
    if (newVal) {
      currentStep.value = 0;
      resultMessage.value = '';
      resultType.value = 'success';
      loading.value = false;
      formValue.tableName = '';
      formValue.tableClass = 'STANDARD';
      formValue.partitionKey = { name: '', type: 'S' as 'S' | 'N' | 'B' };
      formValue.sortKey = { name: '', type: 'S' as 'S' | 'N' | 'B' };
      formValue.billingMode = 'PAY_PER_REQUEST' as 'PAY_PER_REQUEST' | 'PROVISIONED';
      formValue.readCapacity = 5;
      formValue.writeCapacity = 5;
      formValue.tags = [];
      formValue.localSecondaryIndexes = [];
      formValue.globalSecondaryIndexes = [];
      formValue.streamSpecification = {
        streamEnabled: false,
        streamViewType: 'NEW_AND_OLD_IMAGES',
      };
      formValue.sseSpecification = { enabled: false, sseType: 'AWS_OWNED', kmsMasterKeyId: '' };
      formValue.deletionProtection = false;
      errors.tableName = '';
      errors.partitionKey = '';
      errors.readCapacity = '';
      errors.writeCapacity = '';
      gsiDraftOpen.value = false;
      gsiEditIndex.value = null;
      Object.assign(gsiDraft, emptyGsiDraft());
      lsiDraftOpen.value = false;
      lsiEditIndex.value = null;
      Object.assign(lsiDraft, emptyLsiDraft());
    }
  },
);

const validateTableName = () => {
  if (formValue.tableName.length < 3) {
    errors.tableName = lang.t('manage.dynamo.tableNameMinLength');
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(formValue.tableName)) {
    errors.tableName = lang.t('manage.dynamo.tableNameInvalidChars');
  } else if (formValue.tableName.length > 255) {
    errors.tableName = lang.t('manage.dynamo.tableNameMaxLength');
  } else {
    errors.tableName = '';
  }
};

const addTag = () => {
  formValue.tags = [...formValue.tags, { key: '', value: '' }];
};

const removeTag = (index: number) => {
  formValue.tags = formValue.tags.filter((_, i) => i !== index);
};

type GsiDraft = {
  indexName: string;
  partitionKey: { name: string; type: 'S' | 'N' | 'B' };
  sortKey: { name: string; type: 'S' | 'N' | 'B' };
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
  readCapacity: number;
  writeCapacity: number;
};

type LsiDraft = {
  indexName: string;
  sortKey: { name: string; type: 'S' | 'N' | 'B' };
  projectionType: 'ALL' | 'KEYS_ONLY' | 'INCLUDE';
};

const emptyGsiDraft = (): GsiDraft => ({
  indexName: '',
  partitionKey: { name: '', type: 'S' },
  sortKey: { name: '', type: 'S' },
  projectionType: 'ALL',
  readCapacity: 5,
  writeCapacity: 5,
});

const emptyLsiDraft = (): LsiDraft => ({
  indexName: '',
  sortKey: { name: '', type: 'S' },
  projectionType: 'ALL',
});

const gsiDraftOpen = ref(false);
const gsiEditIndex = ref<number | null>(null);
const gsiDraft = reactive<GsiDraft>(emptyGsiDraft());

const lsiDraftOpen = ref(false);
const lsiEditIndex = ref<number | null>(null);
const lsiDraft = reactive<LsiDraft>(emptyLsiDraft());

const openGsiForm = () => {
  Object.assign(gsiDraft, emptyGsiDraft());
  gsiEditIndex.value = null;
  gsiDraftOpen.value = true;
};

const editGsi = (index: number) => {
  Object.assign(gsiDraft, JSON.parse(JSON.stringify(formValue.globalSecondaryIndexes[index])));
  gsiEditIndex.value = index;
  gsiDraftOpen.value = true;
};

const saveGsi = () => {
  const copy = JSON.parse(JSON.stringify(gsiDraft)) as GsiDraft;
  if (gsiEditIndex.value !== null) {
    formValue.globalSecondaryIndexes = formValue.globalSecondaryIndexes.map((g, i) =>
      i === gsiEditIndex.value ? copy : g,
    );
  } else {
    formValue.globalSecondaryIndexes = [...formValue.globalSecondaryIndexes, copy];
  }
  gsiDraftOpen.value = false;
  gsiEditIndex.value = null;
};

const resetGsiDraft = () => {
  Object.assign(gsiDraft, emptyGsiDraft());
  gsiEditIndex.value = null;
};

const removeGsi = (index: number) => {
  formValue.globalSecondaryIndexes = formValue.globalSecondaryIndexes.filter((_, i) => i !== index);
};

const openLsiForm = () => {
  Object.assign(lsiDraft, emptyLsiDraft());
  lsiEditIndex.value = null;
  lsiDraftOpen.value = true;
};

const editLsi = (index: number) => {
  Object.assign(lsiDraft, JSON.parse(JSON.stringify(formValue.localSecondaryIndexes[index])));
  lsiEditIndex.value = index;
  lsiDraftOpen.value = true;
};

const saveLsi = () => {
  const copy = JSON.parse(JSON.stringify(lsiDraft)) as LsiDraft;
  if (lsiEditIndex.value !== null) {
    formValue.localSecondaryIndexes = formValue.localSecondaryIndexes.map((l, i) =>
      i === lsiEditIndex.value ? copy : l,
    );
  } else {
    formValue.localSecondaryIndexes = [...formValue.localSecondaryIndexes, copy];
  }
  lsiDraftOpen.value = false;
  lsiEditIndex.value = null;
};

const resetLsiDraft = () => {
  Object.assign(lsiDraft, emptyLsiDraft());
  lsiEditIndex.value = null;
};

const removeLsi = (index: number) => {
  formValue.localSecondaryIndexes = formValue.localSecondaryIndexes.filter((_, i) => i !== index);
};

const prevStep = () => {
  if (currentStep.value > 0) {
    currentStep.value--;
  }
};

const nextStep = () => {
  if (currentStep.value < steps.length - 1) {
    if (currentStep.value === 0) {
      validateTableName();
      if (errors.tableName) return;
    }
    currentStep.value++;
  }
};

const handleRetry = async () => {
  resultMessage.value = '';
  await handleConfirm();
};

const handleConfirm = async () => {
  if (props.connection.type !== DatabaseType.DYNAMODB) return;

  validateTableName();
  if (errors.tableName) return;

  const startTime = Date.now();

  try {
    loading.value = true;

    const config: CreateTableConfig = {
      tableName: formValue.tableName,
      tableClass: formValue.tableClass,
      partitionKey: formValue.partitionKey,
      sortKey: formValue.sortKey.name ? formValue.sortKey : undefined,
      billingMode: formValue.billingMode,
      readCapacity: formValue.billingMode === 'PROVISIONED' ? formValue.readCapacity : undefined,
      writeCapacity: formValue.billingMode === 'PROVISIONED' ? formValue.writeCapacity : undefined,
      deletionProtection: formValue.deletionProtection || undefined,
      localSecondaryIndexes: formValue.localSecondaryIndexes
        .filter(lsi => lsi.indexName && lsi.sortKey.name)
        .map(lsi => ({
          indexName: lsi.indexName,
          keySchema: [
            {
              attributeName: formValue.partitionKey.name,
              keyType: 'HASH' as const,
              attributeType: formValue.partitionKey.type,
            },
            {
              attributeName: lsi.sortKey.name,
              keyType: 'RANGE' as const,
              attributeType: lsi.sortKey.type,
            },
          ],
          projectionType: lsi.projectionType,
        })),
      globalSecondaryIndexes: formValue.globalSecondaryIndexes
        .filter(gsi => gsi.indexName && gsi.partitionKey.name)
        .map(gsi => ({
          indexName: gsi.indexName,
          keySchema: [
            {
              attributeName: gsi.partitionKey.name,
              keyType: 'HASH' as const,
              attributeType: gsi.partitionKey.type,
            },
            ...(gsi.sortKey.name
              ? [
                  {
                    attributeName: gsi.sortKey.name,
                    keyType: 'RANGE' as const,
                    attributeType: gsi.sortKey.type,
                  },
                ]
              : []),
          ],
          projectionType: gsi.projectionType,
          readCapacityUnits: formValue.billingMode === 'PROVISIONED' ? gsi.readCapacity : undefined,
          writeCapacityUnits:
            formValue.billingMode === 'PROVISIONED' ? gsi.writeCapacity : undefined,
        })),
      streamSpecification: formValue.streamSpecification.streamEnabled
        ? formValue.streamSpecification
        : undefined,
      sseSpecification:
        formValue.sseSpecification.sseType !== 'AWS_OWNED'
          ? {
              enabled: true,
              sseType: formValue.sseSpecification.sseType as 'AES256' | 'KMS',
              kmsMasterKeyId:
                formValue.sseSpecification.sseType === 'KMS'
                  ? formValue.sseSpecification.kmsMasterKeyId || undefined
                  : undefined,
            }
          : undefined,
      tags:
        formValue.tags.filter(t => t.key).length > 0
          ? formValue.tags.filter(t => t.key)
          : undefined,
    };

    const result = await dynamoManageStore.createTable(props.connection, config);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'success';
    resultMessage.value = 'success';

    setTimeout(() => {
      emit('update:show', false);
      emit('created', result.tableName);
    }, SUCCESS_MESSAGE_DELAY);
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingTime));
    }

    resultType.value = 'error';
    const err = error as { details?: string; status?: number; message?: string };
    resultMessage.value = err?.details
      ? `status: ${err?.status ?? 'unknown'}, details: ${err.details}`
      : err?.message || String(error);
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped>
.wizard-container {
  min-height: 300px;
}

.step-indicator {
  flex: 0 0 auto;
}

.index-card {
  border: 1px solid hsl(var(--border));
}

.review-card {
  border: 1px solid hsl(var(--border));
}

.billing-option-card {
  cursor: pointer;
}
</style>
