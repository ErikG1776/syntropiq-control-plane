"use client"

import { create } from "zustand"
import { createJSONStorage, persist } from "zustand/middleware"

export type CustomProtocol = "poll" | "sse" | "ws" | "grpc"
export type CustomAuthType = "none" | "bearer" | "apikey"

export interface CustomDataSource {
  id: string
  label: string
  protocol: CustomProtocol
  url: string
  pollIntervalMs?: number
  authType: CustomAuthType
  authValue?: string
}

interface CustomDataSourceState {
  customDataSources: CustomDataSource[]
  addCustomDataSource: (ds: CustomDataSource) => void
  updateCustomDataSource: (id: string, updates: Partial<CustomDataSource>) => void
  removeCustomDataSource: (id: string) => void
}

const STORAGE_KEY = "syntropiq_custom_datasources_v1"

export const customSourceKey = (id: string) => `custom:${id}`
export const parseCustomSourceKey = (key: string) =>
  key.startsWith("custom:") ? key.slice("custom:".length) : null

export const useCustomDataSourceStore = create<CustomDataSourceState>()(
  persist(
    (set) => ({
      customDataSources: [],
      addCustomDataSource: (ds) =>
        set((state) => ({
          customDataSources: [
            ...state.customDataSources.filter((existing) => existing.id !== ds.id),
            ds,
          ],
        })),
      updateCustomDataSource: (id, updates) =>
        set((state) => ({
          customDataSources: state.customDataSources.map((ds) =>
            ds.id === id ? { ...ds, ...updates, id: ds.id } : ds,
          ),
        })),
      removeCustomDataSource: (id) =>
        set((state) => ({
          customDataSources: state.customDataSources.filter((ds) => ds.id !== id),
        })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ customDataSources: state.customDataSources }),
    },
  ),
)
