"use client";

import { InterfaceFeedback } from "./InterfaceFeedback";

import { useState } from "react";
import { IconCheck, IconChevronDown, IconChevronRight, IconDevices, IconExternalLink } from "@tabler/icons-react";
import { useI18n } from "@/hooks/useI18n";
import type { DeviceDescriptor, DeviceDirectoryResponse } from "@/lib/device-directory-core";
import { selectGatewayDevice } from "@/lib/device-selection-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import styles from "./DeviceSwitcher.module.css";

interface Props {
  variant: "desktop" | "mobile";
  directory: DeviceDirectoryResponse | null;
  initialOpen?: boolean;
  onBeforeNavigate?: () => void;
  onNavigate?: (device: DeviceDescriptor) => void | Promise<void>;
}

export function DeviceSwitcher({
  variant,
  directory: directoryOverride,
  initialOpen = false,
  onBeforeNavigate,
  onNavigate,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(initialOpen);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const directory = directoryOverride;

  if (!directory || directory.devices.length < 2) return null;

  const current = directory.devices.find((device) => device.id === directory.currentDeviceId)
    ?? directory.devices[0];

  const navigate = async (device: DeviceDescriptor) => {
    if (device.id === directory.currentDeviceId || switchingId) return;
    setSwitchError(null);

    if (onNavigate) {
      setSwitchingId(device.id);
      onBeforeNavigate?.();
      try {
        await onNavigate(device);
      } catch (error) {
        setSwitchError(error instanceof Error ? error.message : t("devices.switchFailed"));
      } finally {
        setSwitchingId(null);
      }
      return;
    }

    if (directory.selectionMode === "gateway") {
      setSwitchingId(device.id);
      try {
        await selectGatewayDevice(device.id);
        onBeforeNavigate?.();
        window.location.assign(directory.gatewayUrl ?? "/");
      } catch (error) {
        setSwitchError(error instanceof Error ? error.message : t("devices.switchFailed"));
      } finally {
        setSwitchingId(null);
      }
      return;
    }

    onBeforeNavigate?.();
    window.location.assign(device.url);
  };

  return (
    <div className={`${styles.root} ${styles[variant]}`}>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setSwitchError(null);
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className={styles.trigger}
            aria-label={t("devices.open", { name: current.name })}
          >
            <IconDevices size={17} stroke={1.8} aria-hidden="true" />
            <span className={styles.name}>{current.name}</span>
            <IconChevronDown className={styles.chevron} size={15} stroke={1.8} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          aria-label={t("devices.label")}
          style={{
            width: "max(220px, var(--radix-dropdown-menu-trigger-width, 220px))",
            maxWidth: "calc(100vw - 24px)",
          }}
        >
          {directory.devices.map((device) => {
            const isCurrent = device.id === directory.currentDeviceId;
            const isSwitching = switchingId === device.id;
            return (
              <DropdownMenuItem
                key={device.id}
                className={styles.item}
                disabled={isCurrent || switchingId !== null}
                aria-busy={isSwitching || undefined}
                aria-current={isCurrent ? "page" : undefined}
                title={directory.selectionMode === "direct" ? device.url : device.name}
                onSelect={() => void navigate(device)}
              >
                {isCurrent
                  ? <IconCheck size={16} stroke={2} aria-hidden="true" />
                  : directory.selectionMode === "gateway"
                    ? <IconChevronRight size={15} stroke={1.8} aria-hidden="true" />
                    : <IconExternalLink size={15} stroke={1.8} aria-hidden="true" />}
                <span className={styles.itemText}>
                  <span className={styles.itemName}>{device.name}</span>
                  {directory.selectionMode === "direct" && <span className={styles.itemUrl}>{device.url}</span>}
                  {isSwitching && <span className={styles.itemStatus}>{t("devices.switching")}</span>}
                </span>
                {isCurrent && <span className={styles.current}>{t("devices.current")}</span>}
              </DropdownMenuItem>
            );
          })}
          {switchError && <div className={styles.error} role="alert"><InterfaceFeedback message={switchError} /></div>}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
