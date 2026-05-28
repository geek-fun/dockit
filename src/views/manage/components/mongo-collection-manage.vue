<template>
  <div class="mongo-manage-container">
    <div v-if="!mongoConnection" class="empty-state">
      <Empty :description="$t('manage.emptyNoConnection')" />
    </div>
    <div v-else :class="{ 'pointer-events-none': loading }">
      <section class="metrics-section">
        <div v-if="loading" class="metrics-grid">
          <Card v-for="i in 3" :key="i" class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <div class="skeleton skeleton-label" />
              <div class="skeleton skeleton-value" />
            </CardContent>
          </Card>
        </div>
        <div v-else class="metrics-grid">
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.mongo.totalDocuments') }}</span>
              <span class="metric-value">{{ formatNumber(totalDocuments) }}</span>
            </CardContent>
          </Card>
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.mongo.totalStorage') }}</span>
              <span class="metric-value">{{ formatBytes(totalStorage) }}</span>
            </CardContent>
          </Card>
          <Card class="metric-card">
            <CardContent class="p-4 flex flex-col gap-2">
              <span class="metric-label">{{ $t('manage.mongo.databaseSize') }}</span>
              <span class="metric-value">{{ formatBytes(dbStats?.total_size) }}</span>
            </CardContent>
          </Card>
        </div>
      </section>

      <section class="collections-section">
        <Card class="collections-card">
          <CardHeader>
            <div class="section-header">
              <div class="section-title">
                <span class="i-carbon-data-collection h-4 w-4" />
                <span>{{ $t('manage.mongo.collections') }}</span>
                <Input
                  v-model="searchFilter"
                  :placeholder="$t('manage.mongo.searchCollections')"
                  class="search-input-inline ml-4"
                >
                  <template #prefix>
                    <span class="i-carbon-search h-4 w-4" />
                  </template>
                </Input>
              </div>
              <div class="toolbar-actions">
                <Button size="sm" @click="showCreateCollectionDialog = true">
                  <span class="i-carbon-add h-4 w-4 mr-1" />
                  {{ $t('manage.mongo.createCollection') }}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  class="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  @click="
                    resetDropDatabaseDialog();
                    showDropDatabaseDialog = true;
                  "
                >
                  <span class="i-carbon-trash-can h-4 w-4 mr-1" />
                  {{ $t('manage.mongo.dropDatabase') }}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div v-if="loadingCollections" class="flex justify-center py-8">
              <Spinner size="lg" />
            </div>
            <div v-else-if="filteredCollections.length === 0" class="empty-collections">
              <Empty :description="$t('manage.mongo.noCollections')" />
            </div>
            <div v-else class="table-container">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="cursor-pointer" @click="sortBy('name')">
                      {{ $t('manage.mongo.name') }}
                      <span v-if="sortKey === 'name'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="sortBy('collection_type')">
                      {{ $t('manage.mongo.type') }}
                      <span v-if="sortKey === 'collection_type'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="sortBy('document_count')">
                      {{ $t('manage.mongo.documents') }}
                      <span v-if="sortKey === 'document_count'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="sortBy('storage_size')">
                      {{ $t('manage.mongo.storageSize') }}
                      <span v-if="sortKey === 'storage_size'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="sortBy('index_count')">
                      {{ $t('manage.mongo.indexes') }}
                      <span v-if="sortKey === 'index_count'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="cursor-pointer" @click="sortBy('avg_document_size')">
                      {{ $t('manage.mongo.avgDocSize') }}
                      <span v-if="sortKey === 'avg_document_size'" class="sort-indicator">
                        {{ sortOrder === 'asc' ? '↑' : '↓' }}
                      </span>
                    </TableHead>
                    <TableHead class="w-24">{{ $t('manage.mongo.actions') }}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="coll in sortedCollections"
                    :key="coll.name"
                    class="cursor-pointer collection-row"
                    @click="openInEditor(coll.name)"
                  >
                    <TableCell class="font-medium">
                      <div class="flex items-center gap-2">
                        <span
                          v-if="isFavorite(coll.name)"
                          class="i-carbon-star-filled text-yellow-400 h-4 w-4"
                        />
                        {{ coll.name }}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="getCollectionTypeVariant(coll.collection_type)">
                        {{ coll.collection_type }}
                      </Badge>
                    </TableCell>
                    <TableCell>{{ formatNumber(coll.document_count) }}</TableCell>
                    <TableCell>{{ formatBytes(coll.storage_size) }}</TableCell>
                    <TableCell>{{ coll.index_count ?? '-' }}</TableCell>
                    <TableCell>{{ formatBytes(coll.avg_document_size) }}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger as-child>
                          <Button variant="ghost" size="sm" class="h-8 w-8 p-0" @click.stop>
                            <span class="i-carbon-overflow-menu-horizontal h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem @click.stop="openInEditor(coll.name)">
                            <span class="i-carbon-launch h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.openInEditor') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem @click.stop="copyName(coll.name)">
                            <span class="i-carbon-copy h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.copyName') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem @click.stop="toggleFavorite(coll.name)">
                            <span
                              :class="
                                isFavorite(coll.name) ? 'i-carbon-star-filled' : 'i-carbon-star'
                              "
                              class="h-4 w-4 mr-2"
                            />
                            {{
                              isFavorite(coll.name)
                                ? $t('manage.mongo.unfavorite')
                                : $t('manage.mongo.favorite')
                            }}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem @click.stop="showRenameDialog(coll.name)">
                            <span class="i-carbon-edit h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.renameCollection') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem @click.stop="showCloneDialog(coll.name)">
                            <span class="i-carbon-copy-file h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.cloneCollection') }}
                          </DropdownMenuItem>
                          <DropdownMenuItem @click.stop="showEmptyDialog(coll.name)">
                            <span class="i-carbon-clean h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.emptyCollection') }}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            class="text-destructive"
                            @click.stop="confirmDropCollection(coll.name)"
                          >
                            <span class="i-carbon-trash-can h-4 w-4 mr-2" />
                            {{ $t('manage.mongo.dropCollection') }}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>

    <Dialog
      :open="showCreateDatabaseDialog"
      @update:open="
        val => {
          showCreateDatabaseDialog = val;
          if (!val) resetCreateDatabaseDialog();
        }
      "
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.createDatabaseTitle') }}</DialogTitle>
          <DialogDescription>{{ $t('manage.mongo.createDatabaseDesc') }}</DialogDescription>
        </DialogHeader>
        <Form class="grid gap-4 py-4">
          <FormItem
            :label="$t('manage.mongo.databaseName')"
            required
            :error="createDatabaseErrors.databaseName"
          >
            <Input
              v-model="newDatabaseName"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
              @blur="validateCreateDatabase"
            />
          </FormItem>
          <FormItem
            :label="$t('manage.mongo.initialCollection')"
            required
            :error="createDatabaseErrors.collectionName"
          >
            <Input
              v-model="newCollectionName"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
              @blur="validateCreateDatabase"
            />
          </FormItem>
        </Form>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="submittingCreateDatabase"
            @click="
              showCreateDatabaseDialog = false;
              resetCreateDatabaseDialog();
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            :disabled="!canCreateDatabase || submittingCreateDatabase"
            @click="handleCreateDatabase"
          >
            <Loader2
              v-if="submittingCreateDatabase"
              class="mr-2 h-4 w-4 animate-spin text-foreground"
            />
            {{ $t('common.create') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showCreateCollectionDialog"
      @update:open="
        val => {
          showCreateCollectionDialog = val;
          if (!val) resetCreateCollectionDialog();
        }
      "
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.createCollectionTitle') }}</DialogTitle>
          <DialogDescription>{{ $t('manage.mongo.createCollectionDesc') }}</DialogDescription>
        </DialogHeader>
        <Form class="grid gap-4 py-4">
          <FormItem
            :label="$t('manage.mongo.collectionName')"
            required
            :error="createCollectionErrors.collectionName"
          >
            <Input
              v-model="newCollectionNameOnly"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
              @blur="validateCreateCollection"
            />
          </FormItem>
        </Form>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="submittingCreateCollection"
            @click="
              showCreateCollectionDialog = false;
              resetCreateCollectionDialog();
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            :disabled="!canCreateCollection || submittingCreateCollection"
            @click="handleCreateCollection"
          >
            <Loader2
              v-if="submittingCreateCollection"
              class="mr-2 h-4 w-4 animate-spin text-foreground"
            />
            {{ $t('common.create') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showDropCollectionDialog"
      @update:open="
        val => {
          if (!val) resetDropCollectionDialog();
          showDropCollectionDialog = val;
        }
      "
    >
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.dropCollectionTitle') }}</DialogTitle>
        </DialogHeader>

        <div v-if="dropCollectionResult === 'success'" class="text-center py-4">
          <div class="text-green-500 text-4xl mb-2">✓</div>
          <p class="text-sm font-medium">{{ $t('manage.mongo.collectionDropped') }}</p>
        </div>

        <Alert v-else-if="dropCollectionError" variant="destructive" class="mb-3">
          <AlertDescription class="flex items-center justify-between">
            <span>{{ dropCollectionError }}</span>
            <button
              class="ml-2 text-sm hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="dropCollectionError = ''"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>

        <div v-else class="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {{ $t('manage.mongo.dropCollectionConfirm', { name: collectionToDrop }) }}
            </AlertDescription>
          </Alert>
          <FormItem
            :label="$t('manage.mongo.typeNameToConfirm', { name: collectionToDrop })"
            required
          >
            <Input
              v-model="dropCollectionConfirmName"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
            />
          </FormItem>
        </div>

        <DialogFooter class="mt-4">
          <Button
            variant="outline"
            :disabled="droppingCollection"
            @click="
              resetDropCollectionDialog();
              showDropCollectionDialog = false;
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            v-if="dropCollectionResult === 'error'"
            variant="destructive"
            :disabled="droppingCollection"
            @click="handleDropCollection"
          >
            <Loader2 v-if="droppingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button
            v-else-if="dropCollectionResult !== 'success'"
            variant="destructive"
            :disabled="droppingCollection || dropCollectionConfirmName !== collectionToDrop"
            @click="handleDropCollection"
          >
            <Loader2 v-if="droppingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('common.drop') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showDropDatabaseDialog"
      @update:open="
        val => {
          if (!val) resetDropDatabaseDialog();
          showDropDatabaseDialog = val;
        }
      "
    >
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.dropDatabaseTitle') }}</DialogTitle>
        </DialogHeader>

        <div v-if="dropDatabaseResult === 'success'" class="text-center py-4">
          <div class="text-green-500 text-4xl mb-2">✓</div>
          <p class="text-sm font-medium">{{ $t('manage.mongo.databaseDropped') }}</p>
        </div>

        <Alert v-else-if="dropDatabaseError" variant="destructive" class="mb-3">
          <AlertDescription class="flex items-center justify-between">
            <span>{{ dropDatabaseError }}</span>
            <button
              class="ml-2 text-sm hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="dropDatabaseError = ''"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>

        <div v-else class="space-y-4">
          <Alert variant="destructive">
            <AlertDescription>
              {{ $t('manage.mongo.dropDatabaseConfirm', { name: selectedDatabase }) }}
            </AlertDescription>
          </Alert>
          <FormItem
            :label="$t('manage.mongo.typeNameToConfirm', { name: selectedDatabase })"
            required
          >
            <Input
              v-model="dropDatabaseConfirmName"
              autocapitalize="off"
              autocomplete="off"
              :spellcheck="false"
              autocorrect="off"
            />
          </FormItem>
        </div>

        <DialogFooter class="mt-4">
          <Button
            variant="outline"
            :disabled="droppingDatabase"
            @click="
              resetDropDatabaseDialog();
              showDropDatabaseDialog = false;
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            v-if="dropDatabaseResult === 'error'"
            variant="destructive"
            :disabled="droppingDatabase"
            @click="handleDropDatabase"
          >
            <Loader2 v-if="droppingDatabase" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button
            v-else-if="dropDatabaseResult !== 'success'"
            variant="destructive"
            :disabled="droppingDatabase || dropDatabaseConfirmName !== selectedDatabase"
            @click="handleDropDatabase"
          >
            <Loader2 v-if="droppingDatabase" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('common.drop') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showRenameCollectionDialog"
      @update:open="
        val => {
          showRenameCollectionDialog = val;
          if (!val) resetRenameDialog();
        }
      "
    >
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.renameCollectionTitle') }}</DialogTitle>
          <DialogDescription>
            {{ $t('manage.mongo.renameCollectionDesc', { name: collectionToRename }) }}
          </DialogDescription>
        </DialogHeader>
        <Alert v-if="renameError" variant="destructive">
          <AlertDescription class="flex items-center justify-between">
            <span>{{ renameError }}</span>
            <button
              class="ml-2 text-sm hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="renameError = ''"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <div v-if="renameResult === 'success'" class="text-center py-4">
          <div class="text-green-500 text-4xl mb-2">✓</div>
          <p class="text-sm font-medium">{{ $t('manage.mongo.renameCollectionSuccess') }}</p>
        </div>
        <div v-else>
          <Form class="py-4">
            <FormItem :label="$t('manage.mongo.newCollectionName')" required>
              <Input
                v-model="renameNewName"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
              />
            </FormItem>
          </Form>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="renamingCollection"
            @click="
              showRenameCollectionDialog = false;
              resetRenameDialog();
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            v-if="renameResult === 'error'"
            :disabled="renamingCollection"
            @click="handleRenameCollection"
          >
            <Loader2 v-if="renamingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button
            v-else-if="renameResult !== 'success'"
            :disabled="renamingCollection || !renameNewName.trim()"
            @click="handleRenameCollection"
          >
            <Loader2 v-if="renamingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('manage.mongo.renameCollection') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showCloneCollectionDialog"
      @update:open="
        val => {
          showCloneCollectionDialog = val;
          if (!val) resetCloneDialog();
        }
      "
    >
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.cloneCollectionTitle') }}</DialogTitle>
          <DialogDescription>
            {{ $t('manage.mongo.cloneCollectionDesc', { name: collectionToClone }) }}
          </DialogDescription>
        </DialogHeader>
        <Alert v-if="cloneError" variant="destructive">
          <AlertDescription class="flex items-center justify-between">
            <span>{{ cloneError }}</span>
            <button
              class="ml-2 text-sm hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="cloneError = ''"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <div v-if="cloneResult === 'success'" class="text-center py-4">
          <div class="text-green-500 text-4xl mb-2">✓</div>
          <p class="text-sm font-medium">{{ $t('manage.mongo.cloneCollectionSuccess') }}</p>
        </div>
        <div v-else>
          <Form class="py-4">
            <FormItem :label="$t('manage.mongo.targetCollectionName')" required>
              <Input
                v-model="cloneTargetName"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
              />
            </FormItem>
          </Form>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="cloningCollection"
            @click="
              showCloneCollectionDialog = false;
              resetCloneDialog();
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            v-if="cloneResult === 'error'"
            :disabled="cloningCollection"
            @click="handleCloneCollection"
          >
            <Loader2 v-if="cloningCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button
            v-else-if="cloneResult !== 'success'"
            :disabled="cloningCollection || !cloneTargetName.trim()"
            @click="handleCloneCollection"
          >
            <Loader2 v-if="cloningCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('manage.mongo.cloneCollection') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="showEmptyCollectionDialog"
      @update:open="
        val => {
          showEmptyCollectionDialog = val;
          if (!val) resetEmptyDialog();
        }
      "
    >
      <DialogContent class="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{{ $t('manage.mongo.emptyCollectionTitle') }}</DialogTitle>
        </DialogHeader>
        <Alert v-if="emptyError" variant="destructive">
          <AlertDescription class="flex items-center justify-between">
            <span>{{ emptyError }}</span>
            <button
              class="ml-2 text-sm hover:opacity-70 cursor-pointer"
              aria-label="Dismiss"
              @click="emptyError = ''"
            >
              <X class="w-4 h-4" />
            </button>
          </AlertDescription>
        </Alert>
        <div v-if="emptyResult === 'success'" class="text-center py-4">
          <div class="text-green-500 text-4xl mb-2">✓</div>
          <p class="text-sm font-medium">{{ $t('manage.mongo.emptyCollectionSuccess') }}</p>
        </div>
        <div v-else>
          <Alert variant="destructive">
            <AlertDescription>
              {{ $t('manage.mongo.emptyCollectionConfirm', { name: collectionToEmpty }) }}
            </AlertDescription>
          </Alert>
          <Form class="py-4">
            <FormItem
              :label="$t('manage.mongo.typeNameToConfirm', { name: collectionToEmpty })"
              required
            >
              <Input
                v-model="emptyConfirmName"
                autocapitalize="off"
                autocomplete="off"
                :spellcheck="false"
                autocorrect="off"
              />
            </FormItem>
          </Form>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            :disabled="emptyingCollection"
            @click="
              showEmptyCollectionDialog = false;
              resetEmptyDialog();
            "
          >
            {{ $t('common.cancel') }}
          </Button>
          <Button
            v-if="emptyResult === 'error'"
            variant="destructive"
            :disabled="emptyingCollection"
            @click="handleEmptyCollection"
          >
            <Loader2 v-if="emptyingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('dialogOps.retry') }}
          </Button>
          <Button
            v-else-if="emptyResult !== 'success'"
            variant="destructive"
            :disabled="emptyingCollection || emptyConfirmName !== collectionToEmpty"
            @click="handleEmptyCollection"
          >
            <Loader2 v-if="emptyingCollection" class="mr-2 h-4 w-4 animate-spin" />
            {{ $t('manage.mongo.emptyCollection') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { X, Loader2 } from 'lucide-vue-next';
import { storeToRefs } from 'pinia';
import { useMessageService } from '@/composables';
import prettyBytes from 'pretty-bytes';
import { useClusterManageStore, useConnectionStore, MongoDBConnection } from '../../../store';
import { useTabStore } from '../../../store/tabStore';
import { useLang } from '../../../lang';
import { MIN_LOADING_TIME, SUCCESS_MESSAGE_DELAY, withLoadingDelay } from '../../../common';
import {
  mongoApi,
  type MongoDatabaseInfo,
  type MongoCollectionInfo,
  type MongoDatabaseStats,
} from '../../../datasources';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Empty } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Form, FormItem } from '@/components/ui/form';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const message = useMessageService();
const lang = useLang();

const clusterManageStore = useClusterManageStore();
const { connection } = storeToRefs(clusterManageStore);

const connectionStore = useConnectionStore();

const tabStore = useTabStore();

const mongoConnection = computed(() => connection.value as MongoDBConnection | undefined);

const loading = ref(false);
const loadingDatabases = ref(false);
const loadingCollections = ref(false);

const databases = ref<MongoDatabaseInfo[]>([]);
const selectedDatabase = ref<string>('');
const collections = ref<MongoCollectionInfo[]>([]);
const dbStats = ref<MongoDatabaseStats | null>(null);

const searchFilter = ref('');
const sortKey = ref<string>('name');
const sortOrder = ref<'asc' | 'desc'>('asc');

const showCreateDatabaseDialog = ref(false);
const showCreateCollectionDialog = ref(false);
const showDropCollectionDialog = ref(false);
const showDropDatabaseDialog = ref(false);

const newDatabaseName = ref('');
const newCollectionName = ref('');
const newCollectionNameOnly = ref('');
const collectionToDrop = ref('');

// Drop collection dialog state
const droppingCollection = ref(false);
const dropCollectionConfirmName = ref('');
const dropCollectionError = ref('');
const dropCollectionResult = ref<'success' | 'error' | null>(null);

// Drop database dialog state
const droppingDatabase = ref(false);
const dropDatabaseConfirmName = ref('');
const dropDatabaseError = ref('');
const dropDatabaseResult = ref<'success' | 'error' | null>(null);

// Rename collection dialog state
const showRenameCollectionDialog = ref(false);
const renamingCollection = ref(false);
const collectionToRename = ref('');
const renameNewName = ref('');
const renameError = ref('');
const renameResult = ref<'success' | 'error' | null>(null);

// Clone collection dialog state
const showCloneCollectionDialog = ref(false);
const cloningCollection = ref(false);
const collectionToClone = ref('');
const cloneTargetName = ref('');
const cloneError = ref('');
const cloneResult = ref<'success' | 'error' | null>(null);

// Empty collection dialog state
const showEmptyCollectionDialog = ref(false);
const emptyingCollection = ref(false);
const collectionToEmpty = ref('');
const emptyConfirmName = ref('');
const emptyError = ref('');
const emptyResult = ref<'success' | 'error' | null>(null);

const resetDropCollectionDialog = () => {
  dropCollectionConfirmName.value = '';
  dropCollectionError.value = '';
  dropCollectionResult.value = null;
};

const resetDropDatabaseDialog = () => {
  dropDatabaseConfirmName.value = '';
  dropDatabaseError.value = '';
  dropDatabaseResult.value = null;
};

const resetRenameDialog = () => {
  renameNewName.value = '';
  renameError.value = '';
  renameResult.value = null;
};

const resetCloneDialog = () => {
  cloneTargetName.value = '';
  cloneError.value = '';
  cloneResult.value = null;
};

const resetEmptyDialog = () => {
  emptyConfirmName.value = '';
  emptyError.value = '';
  emptyResult.value = null;
};

const submittingCreateDatabase = ref(false);
const submittingCreateCollection = ref(false);

const createDatabaseErrors = reactive({ databaseName: '', collectionName: '' });
const createCollectionErrors = reactive({ collectionName: '' });

const validateCreateDatabase = () => {
  createDatabaseErrors.databaseName = newDatabaseName.value.trim()
    ? ''
    : lang.t('manage.mongo.nameRequired');
  createDatabaseErrors.collectionName = newCollectionName.value.trim()
    ? ''
    : lang.t('manage.mongo.nameRequired');
};

const validateCreateCollection = () => {
  createCollectionErrors.collectionName = newCollectionNameOnly.value.trim()
    ? ''
    : lang.t('manage.mongo.nameRequired');
};

const canCreateDatabase = computed(
  () => newDatabaseName.value.trim().length > 0 && newCollectionName.value.trim().length > 0,
);

const canCreateCollection = computed(
  () => newCollectionNameOnly.value.trim().length > 0 && !createCollectionErrors.collectionName,
);

const resetCreateDatabaseDialog = () => {
  newDatabaseName.value = '';
  newCollectionName.value = '';
  createDatabaseErrors.databaseName = '';
  createDatabaseErrors.collectionName = '';
};

const resetCreateCollectionDialog = () => {
  newCollectionNameOnly.value = '';
  createCollectionErrors.collectionName = '';
};

const totalDocuments = computed(() =>
  collections.value.reduce((sum, c) => sum + (c.document_count ?? 0), 0),
);

const totalStorage = computed(() =>
  collections.value.reduce((sum, c) => sum + (c.storage_size ?? 0), 0),
);

const filteredCollections = computed(() => {
  const filter = searchFilter.value.toLowerCase();
  if (!filter) return collections.value;
  return collections.value.filter(c => c.name.toLowerCase().includes(filter));
});

const sortedCollections = computed(() => {
  const sorted = [...filteredCollections.value];
  const favorites = mongoConnection.value?.favoriteCollections ?? [];
  const selectedDb = selectedDatabase.value;

  sorted.sort((a, b) => {
    const aFav = favorites.some(f => f.database === selectedDb && f.collection === a.name);
    const bFav = favorites.some(f => f.database === selectedDb && f.collection === b.name);
    if (aFav && !bFav) return -1;
    if (!aFav && bFav) return 1;

    let cmp = 0;
    const aVal = a[sortKey.value as keyof MongoCollectionInfo];
    const bVal = b[sortKey.value as keyof MongoCollectionInfo];

    if (aVal === undefined || aVal === null) cmp = 1;
    else if (bVal === undefined || bVal === null) cmp = -1;
    else if (typeof aVal === 'number' && typeof bVal === 'number') cmp = aVal - bVal;
    else if (typeof aVal === 'string' && typeof bVal === 'string') cmp = aVal.localeCompare(bVal);

    return sortOrder.value === 'asc' ? cmp : -cmp;
  });

  return sorted;
});

const formatNumber = (n: number | undefined | null): string => {
  if (n === undefined || n === null) return '-';
  return n.toLocaleString();
};

const formatBytes = (n: number | undefined | null): string => {
  if (n === undefined || n === null) return '-';
  return prettyBytes(n);
};

const isFavorite = (name: string): boolean => {
  const selectedDb = selectedDatabase.value;
  return (
    mongoConnection.value?.favoriteCollections?.some(
      f => f.database === selectedDb && f.collection === name,
    ) ?? false
  );
};

const toggleFavorite = async (name: string) => {
  if (!mongoConnection.value) return;
  const selectedDb = selectedDatabase.value;
  const favorites = mongoConnection.value.favoriteCollections ?? [];
  const newFavorites = isFavorite(name)
    ? favorites.filter(f => f.database !== selectedDb || f.collection !== name)
    : [...favorites, { database: selectedDb, collection: name }];
  mongoConnection.value.favoriteCollections = newFavorites;
  await connectionStore.saveConnection(mongoConnection.value);
};

const getCollectionTypeVariant = (type: string): 'default' | 'secondary' | 'outline' => {
  if (type === 'timeseries') return 'secondary';
  if (type === 'view') return 'outline';
  return 'default';
};

const sortBy = (key: string) => {
  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortKey.value = key;
    sortOrder.value = 'asc';
  }
};

const router = useRouter();

const openInEditor = async (collectionName: string) => {
  if (!mongoConnection.value || !selectedDatabase.value) return;

  const con: MongoDBConnection = {
    ...mongoConnection.value,
    database: selectedDatabase.value,
  };

  const query = `db.${collectionName}.find({}).limit(50)`;
  await tabStore.establishPanel(con);
  tabStore.activePanel.content = query;
  router.push('/connect');
};

const copyName = (name: string) => {
  navigator.clipboard.writeText(name);
  message.success(lang.t('manage.mongo.nameCopied'));
};

const confirmDropCollection = (name: string) => {
  collectionToDrop.value = name;
  resetDropCollectionDialog();
  showDropCollectionDialog.value = true;
};

const showRenameDialog = (name: string) => {
  collectionToRename.value = name;
  renameNewName.value = name;
  resetRenameDialog();
  showRenameCollectionDialog.value = true;
};

const showCloneDialog = (name: string) => {
  collectionToClone.value = name;
  cloneTargetName.value = `${name}_copy`;
  resetCloneDialog();
  showCloneCollectionDialog.value = true;
};

const showEmptyDialog = (name: string) => {
  collectionToEmpty.value = name;
  resetEmptyDialog();
  showEmptyCollectionDialog.value = true;
};

const fetchDatabases = async () => {
  if (!mongoConnection.value) return;
  loadingDatabases.value = true;

  try {
    const result = await mongoApi.listDatabases(mongoConnection.value);
    if (result.success && result.databases) {
      databases.value = result.databases.filter(
        db => db.name !== 'admin' && db.name !== 'local' && db.name !== 'config',
      );
      if (!selectedDatabase.value && databases.value.length > 0) {
        selectedDatabase.value = databases.value[0].name;
      }
    } else {
      message.error(result.error ?? lang.t('manage.mongo.failedToListDatabases'));
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    loadingDatabases.value = false;
  }
};

const fetchCollectionsWithStats = async () => {
  if (!mongoConnection.value || !selectedDatabase.value) return;
  loadingCollections.value = true;

  try {
    const listResult = await mongoApi.listCollections(
      mongoConnection.value,
      selectedDatabase.value,
    );
    if (!listResult.success || !listResult.collections) {
      message.error(listResult.error ?? lang.t('manage.mongo.failedToListCollections'));
      collections.value = [];
      return;
    }

    const collsWithStats: MongoCollectionInfo[] = [];
    const statsPromises = listResult.collections.map(coll =>
      mongoApi
        .collectionStats(mongoConnection.value!, selectedDatabase.value, coll.name)
        .then(statsResult => {
          if (statsResult.success && statsResult.stats) {
            return {
              name: coll.name,
              collection_type: coll.collection_type,
              document_count: statsResult.stats.count,
              storage_size: statsResult.stats.storage_size,
              index_count: statsResult.stats.nindexes,
              avg_document_size: statsResult.stats.avg_obj_size,
            };
          }
          return coll;
        })
        .catch(() => coll),
    );
    collsWithStats.push(...(await Promise.all(statsPromises)));
    collections.value = collsWithStats;
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
    collections.value = [];
  } finally {
    loadingCollections.value = false;
  }
};

const fetchDatabaseStats = async () => {
  if (!mongoConnection.value || !selectedDatabase.value) return;

  try {
    const result = await mongoApi.databaseStats(mongoConnection.value, selectedDatabase.value);
    if (result.success && result.stats) {
      dbStats.value = result.stats;
    }
  } catch {
    // Silently ignore database stats fetch errors
  }
};

const handleRefresh = async () => {
  loading.value = true;
  try {
    await fetchDatabases();
    if (selectedDatabase.value) {
      await fetchCollectionsWithStats();
      await fetchDatabaseStats();
    }
  } finally {
    loading.value = false;
  }
};

const handleCreateDatabase = async () => {
  validateCreateDatabase();
  if (!canCreateDatabase.value) return;
  if (!mongoConnection.value) return;

  submittingCreateDatabase.value = true;
  try {
    const result = await withLoadingDelay(
      mongoApi.createDatabase(
        mongoConnection.value,
        newDatabaseName.value.trim(),
        newCollectionName.value.trim(),
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      const dbName = newDatabaseName.value.trim();
      message.success(lang.t('manage.mongo.databaseCreated'));
      showCreateDatabaseDialog.value = false;
      resetCreateDatabaseDialog();
      await handleRefresh();
      selectedDatabase.value = dbName;
    } else {
      message.error(result.error ?? lang.t('manage.mongo.failedToCreateDatabase'));
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    submittingCreateDatabase.value = false;
  }
};

const handleCreateCollection = async () => {
  validateCreateCollection();
  if (!canCreateCollection.value) return;
  if (!mongoConnection.value || !selectedDatabase.value) return;

  submittingCreateCollection.value = true;
  try {
    const result = await withLoadingDelay(
      mongoApi.createCollection(
        mongoConnection.value,
        selectedDatabase.value,
        newCollectionNameOnly.value.trim(),
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      message.success(lang.t('manage.mongo.collectionCreated'));
      showCreateCollectionDialog.value = false;
      resetCreateCollectionDialog();
      await fetchCollectionsWithStats();
    } else {
      message.error(result.error ?? lang.t('manage.mongo.failedToCreateCollection'));
    }
  } catch (e) {
    message.error(e instanceof Error ? e.message : String(e));
  } finally {
    submittingCreateCollection.value = false;
  }
};

const handleDropCollection = async () => {
  if (!mongoConnection.value || !selectedDatabase.value || !collectionToDrop.value) return;

  droppingCollection.value = true;
  dropCollectionError.value = '';
  try {
    const result = await withLoadingDelay(
      mongoApi.dropCollection(
        mongoConnection.value,
        selectedDatabase.value,
        collectionToDrop.value,
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      dropCollectionResult.value = 'success';
      setTimeout(() => {
        showDropCollectionDialog.value = false;
        resetDropCollectionDialog();
        fetchCollectionsWithStats();
      }, SUCCESS_MESSAGE_DELAY);
    } else {
      dropCollectionResult.value = 'error';
      dropCollectionError.value = result.error ?? lang.t('manage.mongo.failedToDropCollection');
    }
  } catch (e) {
    dropCollectionResult.value = 'error';
    dropCollectionError.value = e instanceof Error ? e.message : String(e);
  } finally {
    droppingCollection.value = false;
  }
};

const handleDropDatabase = async () => {
  if (!mongoConnection.value || !selectedDatabase.value) return;

  droppingDatabase.value = true;
  dropDatabaseError.value = '';
  try {
    const result = await withLoadingDelay(
      mongoApi.dropDatabase(mongoConnection.value, selectedDatabase.value),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      dropDatabaseResult.value = 'success';
      setTimeout(() => {
        showDropDatabaseDialog.value = false;
        resetDropDatabaseDialog();
        selectedDatabase.value = '';
        handleRefresh();
      }, SUCCESS_MESSAGE_DELAY);
    } else {
      dropDatabaseResult.value = 'error';
      dropDatabaseError.value = result.error ?? lang.t('manage.mongo.failedToDropDatabase');
    }
  } catch (e) {
    dropDatabaseResult.value = 'error';
    dropDatabaseError.value = e instanceof Error ? e.message : String(e);
  } finally {
    droppingDatabase.value = false;
  }
};

const handleRenameCollection = async () => {
  if (!mongoConnection.value || !selectedDatabase.value || !collectionToRename.value) return;
  if (!renameNewName.value.trim()) return;

  renamingCollection.value = true;
  renameError.value = '';
  try {
    const result = await withLoadingDelay(
      mongoApi.renameCollection(
        mongoConnection.value,
        selectedDatabase.value,
        collectionToRename.value,
        renameNewName.value.trim(),
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      renameResult.value = 'success';
      setTimeout(() => {
        showRenameCollectionDialog.value = false;
        resetRenameDialog();
        fetchCollectionsWithStats();
      }, SUCCESS_MESSAGE_DELAY);
    } else {
      renameResult.value = 'error';
      renameError.value = result.error ?? lang.t('manage.mongo.renameCollectionError');
    }
  } catch (e) {
    renameResult.value = 'error';
    renameError.value = e instanceof Error ? e.message : String(e);
  } finally {
    renamingCollection.value = false;
  }
};

const handleCloneCollection = async () => {
  if (!mongoConnection.value || !selectedDatabase.value || !collectionToClone.value) return;
  if (!cloneTargetName.value.trim()) return;

  cloningCollection.value = true;
  cloneError.value = '';
  try {
    const result = await withLoadingDelay(
      mongoApi.cloneCollection(
        mongoConnection.value,
        selectedDatabase.value,
        collectionToClone.value,
        cloneTargetName.value.trim(),
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      cloneResult.value = 'success';

      setTimeout(() => {
        showCloneCollectionDialog.value = false;
        resetCloneDialog();
        fetchCollectionsWithStats();
      }, SUCCESS_MESSAGE_DELAY);
    } else {
      cloneResult.value = 'error';
      cloneError.value = result.error ?? lang.t('manage.mongo.cloneCollectionError');
    }
  } catch (e) {
    cloneResult.value = 'error';
    cloneError.value = e instanceof Error ? e.message : String(e);
  } finally {
    cloningCollection.value = false;
  }
};

const handleEmptyCollection = async () => {
  if (!mongoConnection.value || !selectedDatabase.value || !collectionToEmpty.value) return;

  emptyingCollection.value = true;
  emptyError.value = '';
  try {
    const result = await withLoadingDelay(
      mongoApi.truncateCollection(
        mongoConnection.value,
        selectedDatabase.value,
        collectionToEmpty.value,
      ),
      MIN_LOADING_TIME,
    );
    if (result.success) {
      emptyResult.value = 'success';

      setTimeout(() => {
        showEmptyCollectionDialog.value = false;
        resetEmptyDialog();
        fetchCollectionsWithStats();
      }, SUCCESS_MESSAGE_DELAY);
    } else {
      emptyResult.value = 'error';
      emptyError.value = result.error ?? lang.t('manage.mongo.emptyCollectionError');
    }
  } catch (e) {
    emptyResult.value = 'error';
    emptyError.value = e instanceof Error ? e.message : String(e);
  } finally {
    emptyingCollection.value = false;
  }
};

watch(mongoConnection, async () => {
  if (mongoConnection.value) {
    await handleRefresh();
  }
});

watch(
  () => mongoConnection.value?.activeDatabase,
  async newDb => {
    if (newDb && newDb !== selectedDatabase.value) {
      selectedDatabase.value = newDb;
      await fetchCollectionsWithStats();
      await fetchDatabaseStats();
    }
  },
);

onMounted(async () => {
  if (mongoConnection.value) {
    if (mongoConnection.value.activeDatabase) {
      selectedDatabase.value = mongoConnection.value.activeDatabase;
    }
    await handleRefresh();
  }
});

const showCreateDatabase = () => {
  showCreateDatabaseDialog.value = true;
};

defineExpose({
  handleRefresh,
  showCreateDatabase,
});
</script>

<style scoped>
.mongo-manage-container {
  padding: 1rem;
  height: 100%;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.metrics-section {
  margin-bottom: 1.5rem;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
}

.metric-card {
  background: var(--bg-color);
}

.metric-label {
  font-size: 0.75rem;
  color: var(--text-secondary);
  font-weight: 500;
}

.metric-value {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary);
}

.metric-value-small {
  font-size: 1rem;
  font-weight: 500;
  color: var(--text-primary);
}

.collections-section {
  margin-bottom: 1rem;
}

.collections-card {
  background: var(--bg-color);
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  gap: 0.5rem;
}

.search-input-inline {
  width: 200px;
}

.table-container {
  overflow-x: auto;
}

.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-secondary) 25%,
    var(--bg-color) 50%,
    var(--bg-secondary) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-loading 1.5s infinite;
}

.skeleton-label {
  height: 0.75rem;
  width: 60%;
}

.skeleton-value {
  height: 1.5rem;
  width: 80%;
}

@keyframes skeleton-loading {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.sort-indicator {
  margin-left: 0.25rem;
  font-size: 0.75rem;
}

.collection-row:hover {
  background: var(--bg-hover);
}

.empty-collections {
  padding: 2rem;
  text-align: center;
}
</style>
