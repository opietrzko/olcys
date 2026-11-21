import type { AnalysisResult, SubjectIdentity } from '@olcys/core';
import { CircleUser, ExternalLink, Hash } from 'lucide-react';
import { buildLineage, identityNodeId } from './lineage';
import { CopyButton, IdTag, ID_TYPE, LINK_LABEL, Score, dt, plural, short } from './ui';

interface Props {
  r: AnalysisResult;
  nodeId: string;
  onSelectAddress: (key: string) => void;
  onSelectNode: (id: string) => void;
}

const idKey = (i: { type: string; value: string }) => identityNodeId(i.type, i.value);

/** Dlaczego tożsamość jest w grafie - słowami analityka, bez żargonu reguł. */
function strengthNote(i: SubjectIdentity): string {
  if (i.strength === 'DIRECT') return 'Podany przez analityka na wejściu analizy.';
  if (i.strength === 'PIVOT') return 'Odkryty na profilu lub stronie należącej do podmiotu.';
  if (i.tentative)
    return 'Trop tymczasowy: pochodzi z konta, którego przynależność do podmiotu nie jest potwierdzona (np. znalezionego po samym imieniu i nazwisku). Adresy z tej gałęzi mają powiązanie słabe, dopóki niezależny ślad tego nie potwierdzi.';
  if (i.strength === 'MENTION') return 'Wymieniony obok adresu na stronie, której autor nie jest potwierdzony.';
  return 'Powiązanie słabe: możliwy homonim, wymaga potwierdzenia drugim śladem.';
}

/** Inspektor węzła nie-adresowego: podmiot albo tożsamość (skąd pochodzi, co zebrano, dokąd prowadzi). */
export function NodeInspector({ r, nodeId, onSelectAddress, onSelectNode }: Props) {
  if (nodeId === 'subject') return <SubjectPanel r={r} onSelectAddress={onSelectAddress} onSelectNode={onSelectNode} />;
  const i = r.identities.find((x) => idKey(x) === nodeId);
  if (!i) return <p className="small muted">Ten węzeł nie występuje w bieżącym przebiegu.</p>;

  const t = ID_TYPE[i.type];
  const Icon = t?.icon ?? Hash;
  const lin = buildLineage(r);
  const evById = new Map(r.evidence.map((e) => [e.id, e]));
  const source = i.evidenceId ? evById.get(i.evidenceId) : undefined;
  const parentId = lin.parent.get(nodeId);
  const parent = parentId && parentId !== 'subject' ? r.identities.find((x) => idKey(x) === parentId) : undefined;
  const docs = lin.docsOf(nodeId);
  const docIds = new Set(docs.map((d) => d.id));
  // adresy znalezione w dokumentach tego konta (to samo, co pokazują krawędzie grafu)
  const addresses = r.findings.filter((f) => f.occurrences.some((o) => (lin.docNode.get(o.evidenceId) ?? '') === nodeId || (docIds.has(o.evidenceId))));
  const leads = r.identities.filter((x) => lin.parent.get(idKey(x)) === nodeId);

  return (
    <div className="node-insp">
      <div className="detail-head" style={{ marginBottom: 6 }}>
        <span className="node-type">
          <Icon size={14} aria-hidden="true" />
          {t?.label ?? i.type}
        </span>
        <CopyButton text={i.value} label="Kopiuj identyfikator" />
      </div>
      <p className="node-value">{i.value}</p>
      <div className="node-tags">
        <span className={`tag link-${i.strength}`}>{i.tentative ? 'Trop tymczasowy' : LINK_LABEL[i.strength]}</span>
        <span className="tag outline num">{i.depth === 0 ? 'Wejście' : `Poziom ${i.depth}`}</span>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>
        {strengthNote(i)}
      </p>

      {source && (
        <>
          <h4>Skąd pochodzi</h4>
          <div className="node-src">
            {parent && (
              <button type="button" className="link-btn" onClick={() => onSelectNode(idKey(parent))}>
                {ID_TYPE[parent.type]?.label ?? parent.type}: {short(parent.value, 14)}
              </button>
            )}
            <a href={source.url} target="_blank" rel="noreferrer" className="small">
              {source.title} <ExternalLink size={12} aria-hidden="true" />
            </a>
            <span className="small faint">
              pobrano {dt(source.fetchedAt)} · SHA-256 <span className="mono">{source.sha256.slice(0, 10)}…</span>
            </span>
          </div>
        </>
      )}

      <h4>Zebrane dokumenty</h4>
      {docs.length ? (
        <ul className="node-list">
          {docs.map((d) => (
            <li key={d.id}>
              <a href={d.url} target="_blank" rel="noreferrer">
                {d.title}
              </a>
              <span className="small faint">
                {d.family} · {dt(d.fetchedAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="small muted">Żadne źródło nie zwróciło dokumentów dla tego identyfikatora.</p>
      )}

      <h4>Adresy z tej gałęzi</h4>
      {addresses.length ? (
        <div className="node-rows">
          {addresses.map((f) => (
            <button key={f.key} type="button" className="addr-row" onClick={() => onSelectAddress(f.key)}>
              <span className="node-row-top">
                <span className="chain">{f.chain}</span>
                <span className="mono small">{short(f.address, 6)}</span>
              </span>
              <Score band={f.attribution.band} score={f.attribution.score} />
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">Ten identyfikator nie prowadzi do żadnego adresu krypto.</p>
      )}

      <h4>Kolejne tropy</h4>
      {leads.length ? (
        <div className="node-tags">
          {leads.map((x) => (
            <button key={idKey(x)} type="button" className={`tag link-${x.strength} tag-btn`} onClick={() => onSelectNode(idKey(x))}>
              {ID_TYPE[x.type]?.label ?? x.type}: {short(x.value, 12)}
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">Brak dalszych tropów - ta gałąź się kończy.</p>
      )}
    </div>
  );
}

function SubjectPanel({ r, onSelectAddress, onSelectNode }: { r: AnalysisResult; onSelectAddress: (k: string) => void; onSelectNode: (id: string) => void }) {
  const inputs = r.identities.filter((i) => i.depth === 0);
  const confirmed = r.identities.filter((i) => i.depth > 0 && (i.strength === 'PIVOT' || i.strength === 'DIRECT')).length;
  const tentative = r.identities.filter((i) => i.tentative).length;
  const top = r.findings.filter((f) => !f.attribution.gated && f.attribution.score > 0);
  return (
    <div className="node-insp">
      <div className="detail-head" style={{ marginBottom: 6 }}>
        <span className="node-type">
          <CircleUser size={14} aria-hidden="true" />
          Podmiot
        </span>
      </div>
      <p className="small muted">Osoba badana w tej sprawie. Wszystkie tożsamości i adresy w grafie wychodzą od niej.</p>

      <h4>Dane wejściowe</h4>
      <div className="node-tags">
        {inputs.map((i) => (
          <button key={idKey(i)} type="button" className="tag-plain" onClick={() => onSelectNode(idKey(i))}>
            <IdTag type={i.type} value={i.value} />
          </button>
        ))}
      </div>

      <h4>Zebrane tropy</h4>
      <table className="kv small">
        <tbody>
          <tr>
            <td>Odkryte tożsamości</td>
            <td className="num">{confirmed}</td>
          </tr>
          <tr>
            <td>Tropy tymczasowe (niepotwierdzone)</td>
            <td className="num">{tentative}</td>
          </tr>
          <tr>
            <td>Dowody</td>
            <td className="num">{r.evidence.length}</td>
          </tr>
        </tbody>
      </table>

      <h4>Przypisane adresy</h4>
      {top.length ? (
        <div className="node-rows">
          {top.map((f) => (
            <button key={f.key} type="button" className="addr-row" onClick={() => onSelectAddress(f.key)}>
              <span className="node-row-top">
                <span className="chain">{f.chain}</span>
                <span className="mono small">{short(f.address, 6)}</span>
              </span>
              <Score band={f.attribution.band} score={f.attribution.score} />
            </button>
          ))}
        </div>
      ) : (
        <p className="small muted">{plural(r.findings.length, 'adres', 'adresy', 'adresów')} w sprawie, żaden nie jest przypisany podmiotowi.</p>
      )}
    </div>
  );
}
