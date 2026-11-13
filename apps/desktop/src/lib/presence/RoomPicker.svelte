<script lang="ts">
  // 居場所を共有する部屋を選ぶ。既定は「共有しない」で、選ぶまで何も送らない。
  // 一覧は机が持っているので、開くたびに聞き直す（部屋は割符側で増減する）。
  // クリックでは focus より先に一覧が開くことがあるので、押した時点でも聞く。
  import { t } from '$lib/i18n/i18n.svelte';
  import type { PagePresence } from './pagePresence';

  interface Props {
    presence: PagePresence;
    /** presence の変化で増える数。読むだけで一覧と選択を描き直す。 */
    tick: number;
  }
  const { presence, tick }: Props = $props();

  const rooms = $derived.by(() => {
    void tick;
    return presence.rooms();
  });
  const room = $derived.by(() => {
    void tick;
    return presence.room();
  });
  const denied = $derived.by(() => {
    void tick;
    return presence.denied();
  });

  function onChange(event: Event): void {
    const value = (event.currentTarget as HTMLSelectElement).value;
    presence.setRoom(value === '' ? null : value);
  }
</script>

<span class="room-picker">
  <select
    class="room-select"
    aria-label={t('presence.room')}
    title={t('presence.room')}
    value={room ?? ''}
    onpointerdown={() => presence.askRooms()}
    onfocus={() => presence.askRooms()}
    onchange={onChange}
  >
    <option value="">{t('presence.notSharing')}</option>
    {#each rooms as r, i (r.id)}
      <option value={r.id}>{r.name ?? t('presence.roomN', { n: i + 1 })}（{r.members}）</option>
    {/each}
  </select>
  {#if denied !== null}
    <span class="room-denied" role="alert" title={denied}>{t('presence.denied', { why: denied })}</span>
  {/if}
</span>

<style>
  .room-picker {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    flex-shrink: 1;
    margin-left: auto;
    white-space: nowrap;
    text-transform: none;
    letter-spacing: normal;
  }

  .room-select {
    height: 22px;
    max-width: 180px;
    padding: 0 var(--space-1);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: var(--text-xs-size);
  }

  .room-denied {
    min-width: 0;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--danger-fg);
    font-size: var(--text-xs-size);
  }
</style>
