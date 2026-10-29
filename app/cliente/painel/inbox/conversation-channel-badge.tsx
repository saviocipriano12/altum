import { BrandIcon } from "@/app/cliente/painel/components/ui";
import styles from "./conversation-channel-theme.module.css";

const NETWORKS: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", messenger: "Messenger" };

export function ConversationChannelBadge({ channel = "whatsapp", label }: { channel?: string; label?: string }) {
  const network = NETWORKS[channel];
  const name = label || network || channel.replaceAll("_", " ");
  return <span className={styles.channelBadge}>
    {network ? <span aria-hidden="true"><BrandIcon id={channel} className={styles.channelIcon} /></span> : null}
    <span className="truncate">{name}</span>
  </span>;
}

export function ConversationChannelMark({ channel = "whatsapp" }: { channel?: string }) {
  if (!["whatsapp", "instagram", "messenger"].includes(channel)) return null;
  return <span className={styles.avatarMark}><BrandIcon id={channel} className={styles.channelIcon} /></span>;
}
