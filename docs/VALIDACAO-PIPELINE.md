# Validação: C como Ctrl+C em camada superior (FIFO + cache)

Este roteiro valida a fatia implementada em ADR-0014/0015 com `queue-auto=true`.
Ele materializa o fluxo: **operador copia várias vezes, o FIFO processa em
sequência, o par (clip do sistema, resultado) fica preservado na pilha e a
saída para o sistema só acontece quando o usuário pede.**

## Preparação

```bash
gnome-extensions prefs nexus-clip@bbanho   # confirmar "Fila por natureza" ligada
SD=~/.local/share/gnome-shell/extensions/nexus-clip@bbanho/schemas
gsettings --schemadir "$SD" set org.gnome.shell.extensions.nexus-clip queue-auto true
gsettings --schemadir "$SD" set org.gnome.shell.extensions.nexus-clip shortcuts '[]'
# ⟳ reinicie o shell (Alt+F2 → r) para os defaults sem prompt fixo entrarem
```

`shortcuts '[]'` força uma lista vazia explícita: sem migração de `presets`,
sem prompt grudado. Depois use **Restaurar padrões** nas prefs se quiser os
atalhos C/V/X de volta.

## Cenário RPN — três coletas, três prompts, uma saída

1. Copie `alpha` no sistema.
2. Enfileire prompts (barra `Super+;` → `1`, `2`, `3`, ou `Q` com prompts próprios):
   `Resuma em 1 linha.`, `Traduzir para inglês`, `Liste 2 tópicos`.
3. Pressione `Alt+Super+C` (**coletar**) três vezes, trocando o clipboard entre
   elas para `alpha`, `beta`, `gamma`.

Esperado enquanto processa:
- O badge mostra `NEXUS · FILA 3 · PIPELINE 3 · PRÓX: … · pilha N`.
- Um segundo `C` durante a inferência **não** diz "Ocupado"; entra na fila.
- Cada coleta empilha um `kind: input` seguido de um `kind: result` com
  `parentId` apontando para a entrada correspondente — o par está preservado.
- O clipboard do sistema **não muda** (nenhuma inferência escreve nele).

```bash
python3 -c 'import json;d=json.load(open("'"$HOME"'/.local/share/nexus-clip-gnome/stack.json"));print([(i["kind"],i["text"][:24],(i.get("prompt") or "")[:24]) for i in d["items"][:6]])'
cat ~/.local/share/nexus-clip-gnome/fifo.json
```

## Cenário de cache hit — reprocessar uma tarefa repetida

4. Copie `alpha` de novo, enfileire `Resuma em 1 linha.` e pressione `C`.

Esperado: status `Coletar clipboard + processar · cache · pilha N`; o histórico
registra `cached: true`; nenhuma requisição nova ao gateway.

```bash
tail -2 ~/.local/share/nexus-clip-gnome/history.jsonl | python3 -c \
  'import sys,json;[print(json.loads(l).get("cached"), json.loads(l).get("prompt")) for l in sys.stdin]'
```

Repita com `V` sobre o topo resultante: o par `(resultado_anterior, prompt)`
também deve bater no cache. É aqui que uma tarefa repetida gera novas
abstrações sem custo de rede.

## Saída — explícita, uma vez

5. Pressione `Alt+Super+X` (**mover uma cópia**) uma vez.
6. Cole num editor: o texto é o topo do Nexus; a pilha continua com o item.

Nenhum outro ponto do fluxo escreveu no clipboard do sistema. `Z` (desfazer)
continua sendo a única remoção do topo.

##(Opcional) Ver o pipeline sem gateway

Desligue o gateway e repita as coletas: os jobs entram no pipeline, falham com
`Gateway offline`, e a fila de prompts **não é consumida** (consumo só após
sucesso). O cache continua com o que já havia processado.

## Limites desta fatia

- O token da sessão é aleatório em memória, não vem do gnome-keyring ainda.
- Não há modo RPN explícito nem linter/AST/Python; o que existe é a semântica
  de empilhamento + fila serial que os viabiliza.
- Um restart do Shell limpa o pipeline e o cache; `fifo.json` sobrevive.
