import { defineStore } from 'pinia';
import { invoke } from '@tauri-apps/api/core';
import type { SshProfile, SshConfigHostEntry, SshTunnelConfig } from '@/store';

export const useSshProfileStore = defineStore('sshProfileStore', {
  state: () => ({
    profiles: [] as SshProfile[],
    sshConfigHosts: [] as SshConfigHostEntry[],
    loading: false,
    error: null as string | null,
  }),

  getters: {
    profileOptions: state =>
      state.profiles.map(p => ({
        label: p.name,
        value: p.id,
      })),

    getProfileById: state => {
      return (id: string): SshProfile | undefined => state.profiles.find(p => p.id === id);
    },
  },

  actions: {
    async fetchProfiles() {
      this.loading = true;
      this.error = null;
      try {
        this.profiles = await invoke<SshProfile[]>('list_ssh_profiles');
      } catch (e) {
        this.error = String(e);
      } finally {
        this.loading = false;
      }
    },

    async saveProfile(profile: SshProfile): Promise<SshProfile> {
      const saved = await invoke<SshProfile>('save_ssh_profile', { profile });
      await this.fetchProfiles();
      return saved;
    },

    async deleteProfile(profileId: string) {
      await invoke('delete_ssh_profile', { profileId });
      this.profiles = this.profiles.filter(p => p.id !== profileId);
    },

    async testConnection(
      config: SshTunnelConfig,
      remoteHost: string,
      remotePort: number,
    ): Promise<{ success: boolean; message: string }> {
      return await invoke<{ success: boolean; message: string }>('test_ssh_connection', {
        config,
        remoteHost,
        remotePort,
      });
    },

    async fetchSshConfigHosts() {
      try {
        this.sshConfigHosts = await invoke<SshConfigHostEntry[]>('list_ssh_config_hosts');
      } catch {
        this.sshConfigHosts = [];
      }
    },
  },
});
