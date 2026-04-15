import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Campaign, Scene } from '@trpg/shared';

export const useCampaignStore = defineStore('campaign', () => {
  const currentCampaign = ref<Campaign | null>(null);
  const scenes = ref<Scene[]>([]);
  const myCampaigns = ref<Campaign[]>([]);

  function setCurrentCampaign(campaign: Campaign): void {
    currentCampaign.value = campaign;
  }

  function setScenes(s: Scene[]): void {
    scenes.value = s;
  }

  function setMyCampaigns(campaigns: Campaign[]): void {
    myCampaigns.value = campaigns;
  }

  function clear(): void {
    currentCampaign.value = null;
    scenes.value = [];
  }

  return { currentCampaign, scenes, myCampaigns, setCurrentCampaign, setScenes, setMyCampaigns, clear };
});
