<template>
  <Dialog :open="showModal" @update:open="handleOpenChange">
    <DialogContent class="sm:max-w-[600px]" :show-close="false">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <component :is="dynamoDBIcon" class="h-5 w-5" />
          {{ modalTitle }}
        </DialogTitle>
        <button
          class="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          aria-label="Close"
          @click="closeModal"
        >
          <X class="h-4 w-4" />
        </button>
      </DialogHeader>

      <div class="modal-content">
        <Alert v-if="isSuccess" variant="success" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="resetResult()"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <Alert v-if="isError" variant="destructive" class="mb-4">
          <AlertDescription class="flex items-center justify-between">
            {{ message }}
            <button
              class="ml-2 hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="resetResult()"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>

        <Form @submit.prevent="saveConnect">
          <FormItem :label="$t('connection.name')" required :error="getError('name', errors.name)">
            <Input
              v-model="formData.name"
              :placeholder="$t('connection.name')"
              @blur="handleBlur('name')"
            />
          </FormItem>
          <FormItem :label="$t('connection.connectionMethod')">
            <Tabs
              :model-value="connectionMode"
              @update:model-value="value => onConnectionModeChange(value as string)"
            >
              <TabsList class="w-full">
                <TabsTrigger class="flex-1" value="accessKey">
                  {{ $t('connection.authAccessKey') }}
                </TabsTrigger>
                <TabsTrigger class="flex-1" value="profile">
                  {{ $t('connection.authProfile') }}
                </TabsTrigger>
                <TabsTrigger class="flex-1" value="sso">
                  {{ $t('connection.authSso') }}
                </TabsTrigger>
                <TabsTrigger class="flex-1" value="assumeRole">
                  {{ $t('connection.authAssumeRole') }}
                </TabsTrigger>
                <TabsTrigger class="flex-1" value="local">
                  {{ $t('connection.localTarget') }}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </FormItem>
          <div class="connection-mode-content space-y-4 pt-4">
            <!-- ── Local ── -->
            <template v-if="connectionMode === 'local'">
              <Alert variant="info" class="mb-4">
                <AlertDescription>{{ $t('connection.localLimitations') }}</AlertDescription>
              </Alert>
              <FormItem
                :label="$t('connection.endpointUrl')"
                required
                :error="getError('endpointUrl', errors.endpointUrl)"
              >
                <Input
                  v-model="formData.endpointUrl"
                  placeholder="http://localhost:8000"
                  @blur="handleBlur('endpointUrl')"
                />
              </FormItem>
            </template>

            <!-- ── Non-local (region always shown except profile/assumeRole which override in Advanced) ── -->
            <template v-else>
              <FormItem
                v-if="
                  connectionMode !== 'profile' &&
                  connectionMode !== 'assumeRole' &&
                  connectionMode !== 'sso'
                "
                :label="$t('connection.region')"
                required
                :error="getError('region', errors.region)"
              >
                <SearchableSelect
                  v-model="formData.region"
                  :options="regionOptions"
                  :placeholder="$t('connection.selectRegion')"
                  @update:model-value="handleBlur('region')"
                />
              </FormItem>

              <!-- Access Key fields -->
              <template v-if="connectionMode === 'accessKey'">
                <FormItem :label="$t('connection.accessKeyId')" required>
                  <Input
                    :model-value="
                      (formData.auth.kind === 'accessKey' && formData.auth.accessKeyId) || ''
                    "
                    :placeholder="$t('connection.accessKeyId')"
                    @update:model-value="
                      v => {
                        if (formData.auth.kind === 'accessKey')
                          formData.auth.accessKeyId = v as string;
                      }
                    "
                    @blur="handleBlur('accessKeyId')"
                  />
                </FormItem>
                <FormItem :label="$t('connection.secretAccessKey')" required>
                  <Input
                    :model-value="
                      (formData.auth.kind === 'accessKey' && formData.auth.secretAccessKey) || ''
                    "
                    type="password"
                    :placeholder="$t('connection.secretAccessKey')"
                    @update:model-value="
                      v => {
                        if (formData.auth.kind === 'accessKey')
                          formData.auth.secretAccessKey = v as string;
                      }
                    "
                    @blur="handleBlur('secretAccessKey')"
                  />
                </FormItem>
              </template>

              <!-- Profile field -->
              <template v-if="connectionMode === 'profile'">
                <FormItem :label="$t('connection.profileName')" required>
                  <Select
                    :model-value="
                      (formData.auth.kind === 'profile' && formData.auth.profileName) || ''
                    "
                    @update:model-value="v => onProfileSelect(v as string)"
                  >
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('connection.selectProfile')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="profile in availableProfiles"
                        :key="profile"
                        :value="profile"
                      >
                        {{ profile }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p
                    v-if="availableProfiles.length === 0"
                    class="text-xs text-muted-foreground mt-1"
                  >
                    {{ $t('connection.noProfilesDetected') }}
                  </p>
                </FormItem>

                <button
                  type="button"
                  class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer select-none"
                  @click="profileRegionOverride = !profileRegionOverride"
                >
                  <ChevronRight
                    class="h-3.5 w-3.5 transition-transform"
                    :class="{ 'rotate-90': profileRegionOverride }"
                  />
                  {{ $t('connection.assumeRoleAdvanced') }}
                </button>
                <div v-show="profileRegionOverride" class="space-y-4">
                  <FormItem
                    :label="$t('connection.region')"
                    :error="getError('region', errors.region)"
                  >
                    <SearchableSelect
                      v-model="formData.region"
                      :options="regionOptions"
                      :placeholder="$t('connection.selectRegion')"
                      @update:model-value="handleBlur('region')"
                    />
                  </FormItem>
                </div>
              </template>

              <!-- SSO fields -->
              <template v-if="connectionMode === 'sso'">
                <FormItem :label="$t('connection.ssoStartUrl')" required>
                  <Input
                    v-model="ssoStartUrl"
                    placeholder="https://my-sso-portal.awsapps.com/start"
                  />
                </FormItem>
                <FormItem v-if="ssoRegionRequired" :label="$t('connection.ssoRegion')" required>
                  <SearchableSelect
                    v-model="ssoRegion"
                    :options="regionOptions"
                    :placeholder="$t('connection.ssoRegion')"
                  />
                </FormItem>
                <p v-else class="text-xs text-muted-foreground -mt-1">
                  {{ $t('connection.ssoRegionInferred', { region: ssoInferredRegion }) }}
                </p>

                <template v-if="ssoAuthStatus === 'idle'">
                  <p class="text-sm text-muted-foreground">
                    {{ $t('connection.ssoLoginPrompt') }}
                  </p>
                </template>
                <template v-if="ssoAuthStatus === 'waiting'">
                  <Alert variant="info" class="mb-4">
                    <AlertDescription class="flex items-center gap-2">
                      <Loader2 class="h-4 w-4 animate-spin" />
                      {{ $t('connection.ssoWaiting') }}
                    </AlertDescription>
                  </Alert>
                  <div class="text-sm space-y-1 mb-3">
                    <p>{{ $t('connection.ssoOpenBrowser') }}</p>
                    <p class="font-mono text-xs bg-muted p-2 rounded break-all">
                      {{ ssoVerificationUri }}
                    </p>
                    <p>
                      {{ $t('connection.ssoEnterCode') }}
                      <span class="font-mono font-bold text-base">{{ ssoUserCode }}</span>
                    </p>
                  </div>
                </template>
                <template v-if="ssoAuthStatus === 'authenticated'">
                  <FormItem :label="$t('connection.ssoSelectAccount')" required>
                    <SearchableSelect
                      v-model="ssoSelectedAccountId"
                      :options="ssoAccountOptions"
                      :placeholder="
                        ssoLoadingAccounts
                          ? $t('connection.ssoLoadingAccounts')
                          : $t('connection.ssoAccountPlaceholder')
                      "
                      :disabled="ssoLoadingAccounts"
                      @update:model-value="onSsoAccountSelect"
                    />
                  </FormItem>
                  <FormItem :label="$t('connection.ssoSelectRole')" required>
                    <SearchableSelect
                      v-model="ssoSelectedRoleName"
                      :options="ssoRoleOptions"
                      :placeholder="
                        ssoLoadingRoles
                          ? $t('connection.ssoLoadingRoles')
                          : $t('connection.ssoRolePlaceholder')
                      "
                      :disabled="ssoLoadingRoles || !ssoSelectedAccountId"
                    />
                  </FormItem>
                  <p
                    v-if="!ssoAccountOptions.length && !ssoLoadingAccounts"
                    class="text-sm text-muted-foreground"
                  >
                    {{ $t('connection.ssoNoAccounts') }}
                  </p>
                </template>
                <template v-if="ssoAuthStatus === 'success'">
                  <Alert variant="success" class="mb-4">
                    <AlertDescription>
                      {{ $t('connection.ssoSuccess', { expires: ssoExpiresLabel }) }}
                    </AlertDescription>
                  </Alert>
                </template>
                <template v-if="ssoAuthStatus === 'error'">
                  <Alert variant="destructive" class="mb-4">
                    <AlertDescription>{{ ssoErrorMessage }}</AlertDescription>
                  </Alert>
                </template>
              </template>

              <!-- AssumeRole fields -->
              <template v-if="connectionMode === 'assumeRole'">
                <FormItem :label="$t('connection.assumeRoleSourceProfile')" required>
                  <Select
                    :model-value="assumeRoleSourceProfile"
                    @update:model-value="v => onAssumeRoleProfileChange(v as string)"
                  >
                    <SelectTrigger>
                      <SelectValue :placeholder="$t('connection.selectProfile')" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem
                        v-for="profile in availableProfiles"
                        :key="profile"
                        :value="profile"
                      >
                        {{ profile }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>

                <template v-if="profileRoleOptions.length">
                  <FormItem :label="$t('connection.assumeRoleSelectRole')">
                    <Select
                      :model-value="assumeRoleArn"
                      @update:model-value="v => (assumeRoleArn = v as string)"
                    >
                      <SelectTrigger>
                        <SelectValue :placeholder="$t('connection.assumeRoleSelectRole')" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem
                          v-for="opt in profileRoleOptions"
                          :key="opt.value"
                          :value="opt.value"
                        >
                          {{ opt.label }}
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </FormItem>
                  <p class="text-xs text-muted-foreground -mt-2">
                    {{ $t('connection.assumeRoleOrManual') }}
                  </p>
                </template>

                <FormItem
                  :label="$t('connection.assumeRoleArn')"
                  :required="!profileRoleOptions.length"
                >
                  <Input
                    v-model="assumeRoleArn"
                    :placeholder="$t('connection.assumeRoleArnPlaceholder')"
                  />
                </FormItem>

                <button
                  type="button"
                  class="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground cursor-pointer select-none"
                  @click="assumeRoleAdvancedOpen = !assumeRoleAdvancedOpen"
                >
                  <ChevronRight
                    class="h-3.5 w-3.5 transition-transform"
                    :class="{ 'rotate-90': assumeRoleAdvancedOpen }"
                  />
                  {{ $t('connection.assumeRoleAdvanced') }}
                </button>
                <div v-show="assumeRoleAdvancedOpen" class="space-y-4">
                  <FormItem :label="$t('connection.region')">
                    <SearchableSelect
                      v-model="formData.region"
                      :options="regionOptions"
                      :placeholder="$t('connection.selectRegion')"
                      @update:model-value="handleBlur('region')"
                    />
                  </FormItem>
                  <FormItem :label="$t('connection.assumeRoleExternalId')">
                    <Input
                      v-model="assumeRoleExternalId"
                      :placeholder="$t('connection.assumeRoleExternalIdPlaceholder')"
                    />
                  </FormItem>
                  <FormItem :label="$t('connection.assumeRoleMfaSerial')">
                    <Input
                      v-model="assumeRoleMfaSerial"
                      placeholder="arn:aws:iam::123456789012:mfa/user"
                    />
                  </FormItem>
                  <FormItem v-if="assumeRoleMfaSerial" :label="$t('connection.assumeRoleMfaToken')">
                    <Input
                      v-model="assumeRoleMfaToken"
                      :placeholder="$t('connection.assumeRoleMfaTokenPlaceholder')"
                    />
                  </FormItem>
                </div>

                <template v-if="assumeRoleStatus === 'success'">
                  <Alert variant="success" class="mb-4">
                    <AlertDescription>
                      {{ $t('connection.assumeRoleSuccess', { expires: assumeRoleExpiresLabel }) }}
                    </AlertDescription>
                  </Alert>
                </template>
                <template v-if="assumeRoleStatus === 'error'">
                  <Alert variant="destructive" class="mb-4">
                    <AlertDescription>{{ assumeRoleErrorMessage }}</AlertDescription>
                  </Alert>
                </template>

                <Button
                  variant="secondary"
                  :disabled="!assumeRoleFieldsValid || assumeRoleLoading"
                  @click="doAssumeRole"
                >
                  <Loader2 v-if="assumeRoleLoading" class="mr-2 h-4 w-4 animate-spin" />
                  {{ $t('connection.assumeRoleButton') }}
                </Button>
              </template>
            </template>
          </div>

          <!-- Credential expiry summary (shown for SSO / AssumeRole) -->
          <div
            v-if="connectionMode === 'sso' && ssoAuthStatus === 'success'"
            class="text-xs text-muted-foreground pt-2"
          >
            {{ $t('connection.credsExpireAt', { time: ssoExpiresLabel }) }}
          </div>
          <div
            v-if="connectionMode === 'assumeRole' && assumeRoleStatus === 'success'"
            class="text-xs text-muted-foreground pt-2"
          >
            {{ $t('connection.credsExpireAt', { time: assumeRoleExpiresLabel }) }}
          </div>

          <FormItem :label="$t('connection.tableFilter.label')">
            <RadioGroup
              class="flex flex-row flex-wrap gap-x-5 gap-y-1.5"
              :model-value="filterKind"
              @update:model-value="onFilterKindChange"
            >
              <label
                v-for="opt in filterKindOptions"
                :key="opt.value"
                class="flex items-center gap-1.5 cursor-pointer text-sm select-none"
              >
                <RadioGroupItem :value="opt.value" />
                {{ opt.label }}
              </label>
            </RadioGroup>

            <div class="mt-2.5 space-y-2">
              <template v-if="filterKind === 'explicit' || filterKind === 'exclude'">
                <div class="relative">
                  <Input
                    v-model="filterTableNameInput"
                    :placeholder="$t('connection.tableFilter.searchPlaceholder')"
                    autocomplete="off"
                    @focus="showSuggestions = true"
                    @blur="onInputBlur"
                    @keydown.up.prevent="handleSuggestionKeyDown"
                    @keydown.down.prevent="handleSuggestionKeyDown"
                    @keydown.enter.prevent="handleSuggestionKeyDown"
                    @keydown.escape="showSuggestions = false"
                  />
                  <div
                    v-if="showSuggestions && filteredSuggestions.length"
                    class="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-scroll suggestion-list macos-scrollable"
                  >
                    <button
                      v-for="(name, index) in filteredSuggestions"
                      :key="name"
                      type="button"
                      :class="[
                        'w-full text-left px-3 py-1.5 text-sm hover:bg-accent cursor-pointer',
                        index === highlightedSuggestionIndex && 'bg-accent',
                      ]"
                      @mousedown.prevent="addFilterTableName(name)"
                    >
                      {{ name }}
                    </button>
                  </div>
                </div>
                <div v-if="filterTableNames.length" class="flex flex-wrap gap-1.5">
                  <Badge
                    v-for="name in filterTableNames"
                    :key="name"
                    variant="secondary"
                    class="flex items-center gap-1 cursor-pointer hover:opacity-70"
                    @click="removeFilterTableName(name)"
                  >
                    {{ name }}
                    <X class="h-3 w-3" />
                  </Badge>
                </div>
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>

              <template v-else-if="filterKind === 'regex'">
                <Input
                  :model-value="filterRegex"
                  :placeholder="$t('connection.tableFilter.regexPlaceholder')"
                  @update:model-value="v => onFilterStringChange('regex', v as string)"
                />
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>

              <template v-else>
                <p v-if="matchPreview" class="text-xs text-muted-foreground">
                  {{ matchPreview }}
                </p>
              </template>
            </div>
          </FormItem>
        </Form>
      </div>

      <DialogFooter class="flex justify-between sm:justify-between">
        <div class="left">
          <Button variant="secondary" :disabled="!isFormValid || testLoading" @click="testConnect">
            <Loader2 v-if="testLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('connection.test') }}
          </Button>
        </div>
        <div class="right flex gap-2">
          <Button variant="outline" @click="closeModal">
            {{ $t('dialogOps.cancel') }}
          </Button>
          <Button :disabled="!isFormValid || saveLoading" @click="saveConnect">
            <Loader2 v-if="saveLoading" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.confirm') }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { X, Loader2, ChevronRight } from 'lucide-vue-next';
import { cloneDeep, debounce } from 'lodash';
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';
import * as z from 'zod';
import { CustomError, MIN_LOADING_TIME } from '../../../common';
import dynamoDBIcon from '../../../assets/svg/dynamoDB.svg';
import { useLang } from '../../../lang';
import { useConnectionStore } from '../../../store';
import {
  DatabaseType,
  DynamoDBConnection,
  type DynamoDBAuth,
  type DynamoTableFilter,
  applyTableFilter,
} from '../../../store';
import { ApiClientError } from '../../../datasources/ApiClients';
import { dynamoApi } from '../../../datasources/dynamoApi';
import { useFormValidation, useDialogResult } from '@/composables';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Form, FormItem } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/combobox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';

const connectionStore = useConnectionStore();
const { freshConnection } = connectionStore;
const lang = useLang();

const showModal = ref(false);
const modalTitle = ref(lang.t('connection.new'));
const testLoading = ref(false);
const saveLoading = ref(false);
const { message, isSuccess, isError, succeed, fail, reset: resetResult } = useDialogResult();
const connectionMode = ref<'accessKey' | 'profile' | 'sso' | 'assumeRole' | 'local'>('accessKey');
const availableProfiles = ref<string[]>([]);
const { handleBlur, getError, markSubmitted, resetValidation } = useFormValidation();

// ── SSO state ──
const ssoStartUrl = ref('');
const ssoRegion = ref(''); // only used when region cannot be inferred from start URL

const inferSsoRegion = (url: string): string | null => {
  try {
    const host = new URL(url).hostname;
    // https://ssoins-xxx.eu-west-1.portal.amazonaws.com
    const portalMatch = host.match(/\.([a-z0-9-]+)\.portal\.amazonaws\.com$/);
    if (portalMatch) return portalMatch[1];
    // https://ssoins-xxx.portal.eu-west-1.app.aws
    const appAwsMatch = host.match(/\.portal\.([a-z0-9-]+)\.app\.aws$/);
    if (appAwsMatch) return appAwsMatch[1];
  } catch {
    // invalid URL
  }
  return null;
};

const ssoInferredRegion = computed(() => inferSsoRegion(ssoStartUrl.value));
const ssoRegionRequired = computed(() => !ssoInferredRegion.value);
const ssoEffectiveRegion = computed(() => ssoInferredRegion.value ?? ssoRegion.value);
const ssoVerificationUri = ref('');
const ssoUserCode = ref('');
const ssoClientId = ref('');
const ssoClientSecret = ref('');
const ssoDeviceCode = ref('');
const ssoPollInterval = ref(5);
const ssoPollAbort = ref(false);
const ssoAuthStatus = ref<'idle' | 'waiting' | 'authenticated' | 'success' | 'error'>('idle');
const ssoErrorMessage = ref('');
const ssoLoggingIn = ref(false);
const ssoExpiresAt = ref(0);
const ssoAccessToken = ref('');
const ssoLoadingAccounts = ref(false);
const ssoLoadingRoles = ref(false);
const ssoAccounts = ref<{ accountId: string; accountName: string; emailAddress: string | null }[]>(
  [],
);
const ssoRoles = ref<{ roleName: string; accountId: string }[]>([]);
const ssoSelectedAccountId = ref('');
const ssoSelectedRoleName = ref('');
const ssoAccountOptions = computed(() =>
  ssoAccounts.value.map(a => ({
    label: `${a.accountName} (${a.accountId})`,
    value: a.accountId,
  })),
);
const ssoRoleOptions = computed(() =>
  ssoRoles.value.map(r => ({ label: r.roleName, value: r.roleName })),
);
const ssoExpiresLabel = computed(() =>
  ssoExpiresAt.value ? new Date(ssoExpiresAt.value * 1000).toLocaleString() : '',
);

// ── AssumeRole state ──
const assumeRoleSourceProfile = ref('');
const assumeRoleArn = ref('');
const assumeRoleExternalId = ref('');
const assumeRoleMfaSerial = ref('');
const assumeRoleMfaToken = ref('');
const assumeRoleLoading = ref(false);
const assumeRoleStatus = ref<'idle' | 'success' | 'error'>('idle');
const assumeRoleErrorMessage = ref('');
const assumeRoleExpiresAt = ref(0);
const assumeRoleAdvancedOpen = ref(false);
const profileRegionOverride = ref(false);
const profilesWithRoles = ref<
  {
    profileName: string;
    roleArn: string | null;
    sourceProfile: string | null;
    region: string | null;
  }[]
>([]);
const profileRoleOptions = computed(() =>
  profilesWithRoles.value
    .filter(
      p => p.roleArn && (p.sourceProfile === assumeRoleSourceProfile.value || !p.sourceProfile),
    )
    .map(p => ({ label: `${p.profileName} — ${p.roleArn}`, value: p.roleArn as string })),
);
const assumeRoleExpiresLabel = computed(() =>
  assumeRoleExpiresAt.value ? new Date(assumeRoleExpiresAt.value * 1000).toLocaleString() : '',
);

const regionOptions = [
  { label: 'US East (N. Virginia)', value: 'us-east-1' },
  { label: 'US East (Ohio)', value: 'us-east-2' },
  { label: 'US West (N. California)', value: 'us-west-1' },
  { label: 'US West (Oregon)', value: 'us-west-2' },
  { label: 'Asia Pacific (Mumbai)', value: 'ap-south-1' },
  { label: 'Asia Pacific (Seoul)', value: 'ap-northeast-2' },
  { label: 'Asia Pacific (Singapore)', value: 'ap-southeast-1' },
  { label: 'Asia Pacific (Sydney)', value: 'ap-southeast-2' },
  { label: 'Asia Pacific (Tokyo)', value: 'ap-northeast-1' },
  { label: 'Canada (Central)', value: 'ca-central-1' },
  { label: 'Europe (Frankfurt)', value: 'eu-central-1' },
  { label: 'Europe (Ireland)', value: 'eu-west-1' },
];

const formSchema = computed(() =>
  toTypedSchema(
    z.object({
      name: z.string().min(1, lang.t('connection.formValidation.nameRequired')),
      region: ['profile', 'assumeRole', 'sso'].includes(connectionMode.value)
        ? z.string().optional()
        : z.string().min(1, lang.t('connection.formValidation.regionRequired')),
      endpointUrl: z.string().optional(),
      type: z.nativeEnum(DatabaseType),
    }),
  ),
);

const defaultFormData: DynamoDBConnection = {
  name: '',
  type: DatabaseType.DYNAMODB,
  region: '',
  endpointUrl: '',
  auth: { kind: 'accessKey', accessKeyId: '', secretAccessKey: '' },
};

const formData = ref<DynamoDBConnection>(cloneDeep(defaultFormData));

const {
  errors,
  validate,
  resetForm: veeResetForm,
  setValues,
} = useForm({
  validationSchema: formSchema,
  initialValues: cloneDeep(defaultFormData),
});

watch(formData, newVal => setValues(newVal), { deep: true });

const ssoBaseFieldsValid = computed(
  () => !!ssoStartUrl.value && (!!ssoInferredRegion.value || !!ssoRegion.value),
);

const assumeRoleFieldsValid = computed(
  () => !!assumeRoleSourceProfile.value && !!assumeRoleArn.value,
);

const onConnectionModeChange = (mode: string) => {
  const selectedMode = mode as 'accessKey' | 'profile' | 'sso' | 'assumeRole' | 'local';
  connectionMode.value = selectedMode;

  // Abort any ongoing SSO polling when switching modes
  ssoPollAbort.value = true;

  if (selectedMode === 'local') {
    formData.value = {
      ...formData.value,
      region: 'us-east-1',
      endpointUrl: formData.value.endpointUrl || 'http://localhost:8000',
      auth: { kind: 'accessKey', accessKeyId: 'dummy', secretAccessKey: 'dummy' },
    };
  } else if (selectedMode === 'sso') {
    // Keep existing SSO credentials if re-selecting
    const existingSsoExpiry =
      'expirationTimestamp' in (formData.value.auth as Record<string, unknown>)
        ? (formData.value.auth as Record<string, unknown>).expirationTimestamp
        : undefined;
    formData.value = {
      ...formData.value,
      // Keep formData.region as DynamoDB region, NOT ssoRegion
      endpointUrl: '',
      auth:
        formData.value.auth?.kind === 'sso'
          ? formData.value.auth
          : {
              kind: 'sso',
              accessKeyId: '',
              secretAccessKey: '',
              sessionToken: '',
              // auth.region is for credential metadata, use formData.region
              region: formData.value.region || '',
              ...(existingSsoExpiry ? { expirationTimestamp: existingSsoExpiry as number } : {}),
            },
    };
  } else if (selectedMode === 'assumeRole') {
    formData.value = {
      ...formData.value,
      region: formData.value.region || '',
      endpointUrl: '',
      auth:
        formData.value.auth?.kind === 'assumeRole'
          ? formData.value.auth
          : {
              kind: 'assumeRole',
              accessKeyId: '',
              secretAccessKey: '',
              sessionToken: '',
              region: formData.value.region || '',
            },
    };
  } else {
    const emptyAuth: DynamoDBAuth =
      selectedMode === 'profile'
        ? {
            kind: 'profile',
            profileName:
              formData.value.auth?.kind === 'profile'
                ? (formData.value.auth.profileName ?? '')
                : '',
          }
        : {
            kind: 'accessKey',
            accessKeyId:
              formData.value.auth?.kind === 'accessKey'
                ? (formData.value.auth.accessKeyId ?? '')
                : '',
            secretAccessKey:
              formData.value.auth?.kind === 'accessKey'
                ? (formData.value.auth.secretAccessKey ?? '')
                : '',
          };
    formData.value = {
      ...formData.value,
      region: formData.value.region || '',
      endpointUrl: '',
      auth: emptyAuth,
    };
  }
};

// ── SSO Login flow ──
const startSsoLogin = async () => {
  if (!ssoBaseFieldsValid.value) return;
  ssoPollAbort.value = false;
  ssoLoggingIn.value = true;
  ssoAuthStatus.value = 'idle';
  ssoErrorMessage.value = '';

  try {
    const effectiveSsoRegion = ssoEffectiveRegion.value || 'us-east-1';
    const result = await dynamoApi.ssoStartDeviceAuth(ssoStartUrl.value, effectiveSsoRegion);
    ssoVerificationUri.value = result.verificationUri;
    ssoUserCode.value = result.userCode;
    ssoDeviceCode.value = result.deviceCode;
    ssoClientId.value = result.clientId;
    ssoClientSecret.value = result.clientSecret;
    ssoPollInterval.value = result.interval;
    ssoAuthStatus.value = 'waiting';

    try {
      const { open } = await import('@tauri-apps/plugin-shell');
      open(result.verificationUri);
    } catch {
      /* URL already shown in UI */
    }

    await pollSsoToken(effectiveSsoRegion);
  } catch (err: unknown) {
    ssoAuthStatus.value = 'error';
    ssoErrorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    ssoLoggingIn.value = false;
  }
};

const pollSsoToken = async (ssoApiRegion: string) => {
  const maxAttempts = 120;
  for (let i = 0; i < maxAttempts && !ssoPollAbort.value; i++) {
    await new Promise(resolve => setTimeout(resolve, ssoPollInterval.value * 1000));

    try {
      const result = await dynamoApi.ssoPollToken(
        ssoApiRegion,
        ssoClientId.value,
        ssoClientSecret.value,
        ssoDeviceCode.value,
      );

      if (result.status === 'success' && result.accessToken) {
        ssoAccessToken.value = result.accessToken;
        ssoAuthStatus.value = 'authenticated';

        ssoLoadingAccounts.value = true;
        try {
          ssoAccounts.value = await dynamoApi.ssoListAccounts(ssoApiRegion, result.accessToken);
        } finally {
          ssoLoadingAccounts.value = false;
        }
        return;
      }

      if (result.status === 'error') {
        ssoAuthStatus.value = 'error';
        ssoErrorMessage.value = result.errorMessage || 'SSO authentication failed';
        return;
      }
    } catch (err: unknown) {
      ssoAuthStatus.value = 'error';
      ssoErrorMessage.value = err instanceof Error ? err.message : String(err);
      return;
    }
  }

  ssoAuthStatus.value = 'error';
  ssoErrorMessage.value = 'SSO authentication timed out. Please try again.';
};

const onSsoAccountSelect = async (accountId: string) => {
  ssoSelectedRoleName.value = '';
  ssoRoles.value = [];
  if (!accountId) return;
  const effectiveSsoRegion = ssoEffectiveRegion.value || 'us-east-1';
  ssoLoadingRoles.value = true;
  try {
    ssoRoles.value = await dynamoApi.ssoListRoles(
      effectiveSsoRegion,
      ssoAccessToken.value,
      accountId,
    );
  } finally {
    ssoLoadingRoles.value = false;
  }
};

const completeSsoLogin = async (): Promise<boolean> => {
  if (!ssoSelectedAccountId.value || !ssoSelectedRoleName.value) return false;
  ssoLoggingIn.value = true;
  try {
    const effectiveSsoRegion = ssoEffectiveRegion.value || 'us-east-1';
    const creds = await dynamoApi.ssoGetRoleCredentials(
      effectiveSsoRegion,
      ssoAccessToken.value,
      ssoSelectedAccountId.value,
      ssoSelectedRoleName.value,
    );
    ssoExpiresAt.value = creds.expirationTimestamp;
    ssoAuthStatus.value = 'success';
    formData.value = {
      ...formData.value,
      auth: {
        kind: 'sso',
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        region: formData.value.region || 'us-east-1',
        expirationTimestamp: creds.expirationTimestamp,
      },
    };
    return true;
  } catch (err: unknown) {
    ssoAuthStatus.value = 'error';
    ssoErrorMessage.value = err instanceof Error ? err.message : String(err);
    return false;
  } finally {
    ssoLoggingIn.value = false;
  }
};

const regionFromProfile = (profileName: string) =>
  profilesWithRoles.value.find(p => p.profileName === profileName)?.region ?? null;

const onProfileSelect = (profileName: string) => {
  if (formData.value.auth.kind === 'profile') formData.value.auth.profileName = profileName;
  if (!profileRegionOverride.value) {
    const region = regionFromProfile(profileName);
    if (region) formData.value = { ...formData.value, region };
  }
};

const onAssumeRoleProfileChange = (profile: string) => {
  assumeRoleSourceProfile.value = profile;
  assumeRoleArn.value = '';
  if (!profileRegionOverride.value) {
    const region = regionFromProfile(profile);
    if (region) formData.value = { ...formData.value, region };
  }
};

const doAssumeRole = async () => {
  if (!assumeRoleFieldsValid.value) return;
  assumeRoleLoading.value = true;
  assumeRoleStatus.value = 'idle';
  assumeRoleErrorMessage.value = '';

  try {
    const result = await dynamoApi.assumeRole(
      assumeRoleSourceProfile.value,
      assumeRoleArn.value,
      assumeRoleExternalId.value || undefined,
      assumeRoleMfaSerial.value || undefined,
      assumeRoleMfaToken.value || undefined,
    );

    assumeRoleExpiresAt.value = result.expirationTimestamp;
    assumeRoleStatus.value = 'success';

    // Update formData with assumed credentials
    formData.value = {
      ...formData.value,
      region: formData.value.region || 'us-east-1',
      auth: {
        kind: 'assumeRole',
        accessKeyId: result.accessKeyId,
        secretAccessKey: result.secretAccessKey,
        sessionToken: result.sessionToken,
        region: formData.value.region || 'us-east-1',
        expirationTimestamp: result.expirationTimestamp,
      },
    };
  } catch (err: unknown) {
    assumeRoleStatus.value = 'error';
    assumeRoleErrorMessage.value = err instanceof Error ? err.message : String(err);
  } finally {
    assumeRoleLoading.value = false;
  }
};

const handleOpenChange = (open: boolean) => {
  if (!open) closeModal();
};

const showMedal = (con: DynamoDBConnection | null) => {
  showModal.value = true;
  resetResult();
  if (con) {
    formData.value = { ...con };
    veeResetForm({ values: { ...con } });
    connectionMode.value = con.endpointUrl
      ? 'local'
      : con.auth?.kind === 'profile'
        ? 'profile'
        : con.auth?.kind === 'sso'
          ? 'sso'
          : con.auth?.kind === 'assumeRole'
            ? 'assumeRole'
            : 'accessKey';

    // Restore SSO state if editing SSO connection
    if (con.auth?.kind === 'sso') {
      ssoAuthStatus.value = 'success';
      ssoExpiresAt.value =
        ((con.auth as Record<string, unknown>).expirationTimestamp as number) || 0;
    }
    // Restore AssumeRole state if editing
    if (con.auth?.kind === 'assumeRole') {
      assumeRoleStatus.value = 'success';
      assumeRoleExpiresAt.value =
        ((con.auth as Record<string, unknown>).expirationTimestamp as number) || 0;
    }

    modalTitle.value = lang.t('connection.edit');
  } else {
    formData.value = cloneDeep(defaultFormData);
    veeResetForm({ values: cloneDeep(defaultFormData) });
    connectionMode.value = 'accessKey';
    resetSsoState();
    resetAssumeRoleState();
  }
  availableProfiles.value = [];
  fetchProfiles();
  fetchProfilesWithRoles();
  resetValidation();
};

const resetSsoState = () => {
  ssoPollAbort.value = true;
  ssoStartUrl.value = '';
  ssoRegion.value = '';
  ssoAuthStatus.value = 'idle';
  ssoErrorMessage.value = '';
  ssoExpiresAt.value = 0;
  ssoAccessToken.value = '';
  ssoAccounts.value = [];
  ssoRoles.value = [];
  ssoSelectedAccountId.value = '';
  ssoSelectedRoleName.value = '';
};

const resetAssumeRoleState = () => {
  assumeRoleSourceProfile.value = '';
  assumeRoleArn.value = '';
  assumeRoleExternalId.value = '';
  assumeRoleMfaSerial.value = '';
  assumeRoleMfaToken.value = '';
  assumeRoleStatus.value = 'idle';
  assumeRoleErrorMessage.value = '';
  assumeRoleExpiresAt.value = 0;
  assumeRoleAdvancedOpen.value = false;
};

const closeModal = () => {
  showModal.value = false;
  formData.value = cloneDeep(defaultFormData);
  veeResetForm({ values: cloneDeep(defaultFormData) });
  modalTitle.value = lang.t('connection.new');
  resetResult();
  connectionMode.value = 'accessKey';
  availableTables.value = [];
  filterTableNameInput.value = '';
  showSuggestions.value = false;
  resetSsoState();
  resetAssumeRoleState();
  resetValidation();
};

const isFormValid = computed(() => {
  if (!formData.value.name) return false;

  if (connectionMode.value === 'local') {
    return !!formData.value.endpointUrl;
  }

  if (!formData.value.region && !['profile', 'assumeRole', 'sso'].includes(connectionMode.value))
    return false;

  const auth = formData.value.auth;
  if (!auth) return false;

  switch (auth.kind) {
    case 'accessKey':
      return !!(auth.accessKeyId && auth.secretAccessKey);
    case 'profile':
      return !!auth.profileName;
    case 'sso':
    case 'assumeRole':
      if (auth.accessKeyId && auth.secretAccessKey && auth.sessionToken) return true;
      if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'idle')
        return ssoBaseFieldsValid.value;
      if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'authenticated')
        return !!(ssoSelectedAccountId.value && ssoSelectedRoleName.value);
      if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'error') return true;
      return false;
    default:
      return false;
  }
});

const testConnect = async () => {
  resetResult();
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'idle') {
    await startSsoLogin();
    return;
  }
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'error') {
    ssoAuthStatus.value = 'idle';
    return;
  }
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'authenticated') {
    if (!(await completeSsoLogin())) return;
  }
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    fail(lang.t('connection.validationFailed'));
    return;
  }

  if (!validateAuth()) {
    fail(lang.t('connection.validationFailed'));
    return;
  }

  testLoading.value = true;
  const startTime = Date.now();

  try {
    await freshConnection(formData.value);

    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) await new Promise(resolve => setTimeout(resolve, remainingTime));

    succeed(lang.t('connection.testSuccess'));
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const remainingTime = Math.max(0, MIN_LOADING_TIME - elapsed);
    if (remainingTime > 0) await new Promise(resolve => setTimeout(resolve, remainingTime));

    if (error instanceof CustomError) {
      fail(error.details || `Connection failed (status: ${error.status})`);
    } else if (error instanceof ApiClientError) {
      fail(error.details || `Connection failed (status: ${error.status})`);
    } else if (error instanceof Error) {
      fail(error.message);
    } else {
      fail(lang.t('connection.unknownError'));
    }
  } finally {
    testLoading.value = false;
  }
};

const validateAuth = (): boolean => {
  const auth = formData.value.auth;
  if (!auth) return false;
  switch (auth.kind) {
    case 'accessKey':
      return !!auth.accessKeyId && !!auth.secretAccessKey;
    case 'profile':
      return !!auth.profileName;
    case 'sso':
    case 'assumeRole':
      return !!(auth.accessKeyId && auth.secretAccessKey && auth.sessionToken);
    default:
      return false;
  }
};

const fetchProfiles = async () => {
  try {
    availableProfiles.value = await dynamoApi.listProfiles();
  } catch {
    availableProfiles.value = [];
  }
};

const fetchProfilesWithRoles = async () => {
  try {
    profilesWithRoles.value = await dynamoApi.listProfilesWithRoles();
  } catch {
    profilesWithRoles.value = [];
  }
};

const saveConnect = async () => {
  resetResult();
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'idle') {
    await startSsoLogin();
    return;
  }
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'error') {
    ssoAuthStatus.value = 'idle';
    return;
  }
  if (connectionMode.value === 'sso' && ssoAuthStatus.value === 'authenticated') {
    if (!(await completeSsoLogin())) return;
  }
  markSubmitted();

  const { valid } = await validate();
  if (!valid) {
    fail(lang.t('connection.validationFailed'));
    return;
  }

  saveLoading.value = true;
  const result = await connectionStore.saveConnection(formData.value);
  if (result.success) {
    closeModal();
  } else {
    fail(result.message);
  }
  saveLoading.value = false;
};

// ── Table filter ─────────────────────────────────────────────────────────────

const filterKindOptions = computed(() => [
  { value: 'all', label: lang.t('connection.tableFilter.kindAll') },
  { value: 'explicit', label: lang.t('connection.tableFilter.kindExplicit') },
  { value: 'exclude', label: lang.t('connection.tableFilter.kindExclude') },
  { value: 'regex', label: lang.t('connection.tableFilter.kindRegex') },
]);

const filterKind = computed<DynamoTableFilter['kind']>(
  () => formData.value.tableFilter?.kind ?? 'all',
);

const filterTableNames = computed<string[]>(() => {
  const f = formData.value.tableFilter;
  return f && (f.kind === 'explicit' || f.kind === 'exclude') ? f.tableNames : [];
});

const filterRegex = computed<string>(() => {
  const f = formData.value.tableFilter;
  return f?.kind === 'regex' ? f.pattern : '';
});

// Raw table list fetched silently from the connection
const availableTables = ref<string[]>([]);
let fetchAbortFlag = 0;

const silentFetchTables = async () => {
  const tick = ++fetchAbortFlag;
  try {
    const tables = await dynamoApi.listTables(formData.value);
    if (tick === fetchAbortFlag) availableTables.value = tables;
  } catch {
    // silently ignore — no credentials yet or invalid
  }
};

const debouncedFetchTables = debounce(silentFetchTables, 500);

watch(
  isFormValid,
  valid => {
    if (valid) debouncedFetchTables();
    else availableTables.value = [];
  },
  { immediate: true },
);

// Match preview (count + sample names, max 3)
const PREVIEW_SAMPLE = 3;
const matchedTables = computed(() =>
  applyTableFilter(availableTables.value, formData.value.tableFilter),
);

const matchPreview = computed(() => {
  if (!availableTables.value.length) return '';
  const matched = matchedTables.value;
  const sample = matched.slice(0, PREVIEW_SAMPLE).join(', ');
  const suffix =
    matched.length > PREVIEW_SAMPLE ? `, +${matched.length - PREVIEW_SAMPLE} more` : '';
  return lang.t('connection.tableFilter.matchPreview', {
    count: matched.length,
    sample: sample + suffix,
  });
});

// Autocomplete for explicit / exclude
const filterTableNameInput = ref('');
const showSuggestions = ref(false);

const filteredSuggestions = computed(() => {
  const q = filterTableNameInput.value.trim().toLowerCase();
  const selected = new Set(filterTableNames.value);
  return availableTables.value.filter(
    name => !selected.has(name) && (!q || name.toLowerCase().includes(q)),
  );
});

const onInputBlur = () => {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 150);
};

const addFromInputOrFirst = () => {
  const name = filterTableNameInput.value.trim();
  if (name) {
    addFilterTableName(name);
  } else if (filteredSuggestions.value.length) {
    addFilterTableName(filteredSuggestions.value[0]);
  }
};

const highlightedSuggestionIndex = ref(-1);

watch(filterTableNameInput, () => {
  highlightedSuggestionIndex.value = -1;
});

const handleSuggestionKeyDown = (e: KeyboardEvent) => {
  const suggestions = filteredSuggestions.value;

  switch (e.key) {
    case 'ArrowDown':
      if (!suggestions.length) return;
      e.preventDefault();
      highlightedSuggestionIndex.value =
        highlightedSuggestionIndex.value < suggestions.length - 1
          ? highlightedSuggestionIndex.value + 1
          : 0;
      break;
    case 'ArrowUp':
      if (!suggestions.length) return;
      e.preventDefault();
      highlightedSuggestionIndex.value =
        highlightedSuggestionIndex.value > 0
          ? highlightedSuggestionIndex.value - 1
          : suggestions.length - 1;
      break;
    case 'Enter':
      e.preventDefault();
      if (highlightedSuggestionIndex.value >= 0 && suggestions[highlightedSuggestionIndex.value]) {
        addFilterTableName(suggestions[highlightedSuggestionIndex.value]);
      } else {
        addFromInputOrFirst();
      }
      break;
  }
};

const onFilterKindChange = (kind: string) => {
  filterTableNameInput.value = '';
  showSuggestions.value = false;
  const k = kind as DynamoTableFilter['kind'];
  if (k === 'all') {
    formData.value = { ...formData.value, tableFilter: { kind: 'all' } };
  } else if (k === 'explicit' || k === 'exclude') {
    formData.value = { ...formData.value, tableFilter: { kind: k, tableNames: [] } };
  } else {
    formData.value = { ...formData.value, tableFilter: { kind: 'regex', pattern: '' } };
  }
};

const addFilterTableName = (name: string) => {
  const trimmed = name.trim();
  if (!trimmed) return;
  const f = formData.value.tableFilter;
  if (!f || (f.kind !== 'explicit' && f.kind !== 'exclude')) return;
  if (f.tableNames.includes(trimmed)) {
    filterTableNameInput.value = '';
    return;
  }
  formData.value = {
    ...formData.value,
    tableFilter: { ...f, tableNames: [...f.tableNames, trimmed] },
  };
  filterTableNameInput.value = '';
  showSuggestions.value = false;
};

const removeFilterTableName = (name: string) => {
  const f = formData.value.tableFilter;
  if (!f || (f.kind !== 'explicit' && f.kind !== 'exclude')) return;
  formData.value = {
    ...formData.value,
    tableFilter: { ...f, tableNames: f.tableNames.filter(n => n !== name) },
  };
};

const onFilterStringChange = (_field: 'regex', value: string) => {
  formData.value = { ...formData.value, tableFilter: { kind: 'regex', pattern: value } };
};

defineExpose({ showMedal });
</script>

<style scoped>
.connection-mode-content {
  min-height: 260px;
}
</style>
