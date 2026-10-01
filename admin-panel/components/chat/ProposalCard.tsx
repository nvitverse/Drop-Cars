// The Confirm card for one action the assistant prepared. The card only ever sends the proposal id: the server keeps the arguments,
// so what you read here is exactly what runs. High / sensitive actions need a second tap.
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import { chatApi, Proposal } from '@/services/chatApi';

const RISK_LABEL: Record<Proposal['risk'], string> = { low: 'Low risk', medium: 'Needs care', high: 'High risk', sensitive: 'Sensitive' };

export default function ProposalCard({ proposal, colors }: { proposal: Proposal; colors: any }) {
  const [p, setP] = useState<Proposal>(proposal);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<Record<string, any> | null>(null);     // e.g. the OTP: lives only in this card's memory

  // the saved message only holds the status at the time it was written
  useEffect(() => {
    let live = true;
    chatApi.getProposal(proposal.id).then((fresh) => { if (live) setP(fresh); }).catch(() => {});
    return () => { live = false; };
  }, [proposal.id]);

  const confirm = async () => {
    if ((p.risk === 'high' || p.risk === 'sensitive') && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await chatApi.executeProposal(p.id);
      setP(r.proposal);
      if (r.data) setData(r.data);
    } catch (e: any) {
      setError(e?.message || 'Could not run this.');
      chatApi.getProposal(p.id).then(setP).catch(() => {});
    } finally {
      setBusy(false);
      setArmed(false);
    }
  };

  const dismiss = async () => {
    setBusy(true);
    try { setP(await chatApi.dismissProposal(p.id)); } catch (e: any) { setError(e?.message || 'Could not dismiss.'); } finally { setBusy(false); }
  };

  const pending = p.status === 'PENDING';
  const tone = p.risk === 'high' || p.risk === 'sensitive' ? colors.error : p.risk === 'medium' ? colors.warning : colors.primary;
  const statusText: Record<string, string> = {
    EXECUTED: p.message || 'Done.', FAILED: p.message || 'Could not be done.', DISMISSED: 'Dismissed.', EXPIRED: 'Expired. Ask again.', EXECUTING: 'Running...',
  };

  return (
    <View style={[s.card, { borderColor: tone, backgroundColor: colors.surface }]}>
      <View style={s.head}>
        <ShieldCheck size={14} color={tone} />
        <Text style={[s.risk, { color: tone }]}>{RISK_LABEL[p.risk]} - waiting for you</Text>
      </View>
      <Text style={[s.summary, { color: colors.text }]}>{p.summary}</Text>
      {data ? (
        <View style={[s.secret, { backgroundColor: colors.surfaceAlt }]}>
          {Object.entries(data).filter(([, v]) => typeof v === 'string' || typeof v === 'number').map(([k, v]) => (
            <Text key={k} style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>{k.replace(/_/g, ' ')}: {String(v)}</Text>
          ))}
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>Shown only here. It is not saved in the chat.</Text>
        </View>
      ) : null}
      {pending ? (
        <View style={s.row}>
          <TouchableOpacity style={[s.btn, { backgroundColor: tone, opacity: busy ? 0.6 : 1 }]} disabled={busy} onPress={confirm}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{armed ? 'Tap again to confirm' : 'Confirm'}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, { backgroundColor: colors.surfaceAlt }]} disabled={busy} onPress={dismiss}>
            <Text style={[s.btnText, { color: colors.textSecondary }]}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={{ color: p.status === 'EXECUTED' ? colors.success : colors.textSecondary, fontWeight: '700', fontSize: 12.5 }}>{statusText[p.status] || p.status}</Text>
      )}
      {error ? <Text style={{ color: colors.error, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginTop: 8, padding: 10, borderRadius: 12, borderWidth: 1, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  risk: { fontSize: 11.5, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  summary: { fontSize: 13.5, lineHeight: 19 },
  secret: { padding: 8, borderRadius: 8, gap: 2 },
  row: { flexDirection: 'row', gap: 8 },
  btn: { flex: 1, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13.5 },
});
