# Jogo-Foda
Um jogo que deve rodar no navegador

Pressione **P** ou clique no botão **Tela cheia** para alternar a exibição. **Esc** também sai da tela cheia. O jogo abre dentro da página e só expande quando solicitado.

Segure **Shift** junto com WASD ou as setas para correr a pé, tanto no mapa quanto dentro dos prédios. Caminhada: **20 km/h**; corrida: **40 km/h**, usando a mesma conversão do painel da moto. Esses são os valores com fome e sede cheias; a condição do personagem pode reduzi-los. Soltar Shift volta à caminhada. A diagonal mantém a mesma velocidade, e as colisões continuam ativas.

## Manutenção da moto

Desmonte da moto, aproxime-se e pressione F. As abas Motor, Pneus e Guidão mantêm os diagnósticos existentes. Clique em um serviço para reparar.

- Reparos: ignição por sincronização, folga de válvulas, vedação de furo no motor, mistura, remendos com secagem da cola, calibragem, fixações, limpeza com escova (clique ou arraste), alinhamento, cabos, torque e rolamentos.
- Controles: clique nos componentes, 1–4 para pontos de trabalho, 5–8 para conectores, setas ou −/+ para ajustes e E para confirmar. Esc cancela.
- Um reparo concluído consome um kit existente. Treinos em peças e moto íntegras não consomem kits. Falhas e cancelamentos não alteram a peça nem gastam recursos.

Verificação da lógica: `node tests/bike-maintenance.test.js`.
Os reparos também aceitam gestos com o mouse: gire a chave ao redor da fixação, mova a bomba para baixo e para cima, esfregue a lixa e a escova, arraste cabos até os conectores e mantenha o remendo pressionado por 0,8 segundo depois de a cola secar. Arraste a lâmina e o guidão para ajustar folga e alinhamento. O cursor mostra uma mão com a ferramenta da etapa atual e volta ao normal ao terminar, cancelar ou fechar a inspeção.
A moto sofre desgaste gradual enquanto o tempo de jogo passa: cerca de 1–3 pontos percentuais por dez minutos rodando, conforme a peça e a velocidade, e desgaste mínimo quando estacionada. O desgaste também continua durante a inspeção. Colisões danificam um único defeito de uma peça aleatória, com perda leve proporcional à velocidade do impacto. Contatos muito leves não causam dano; há 1,5 segundo de intervalo entre impactos. O aviso identifica a peça e os reparos existentes restauram o defeito afetado. Esse dano também se aplica aos obstáculos das perseguições.
## Câmbio e painel

A moto possui quatro marchas manuais: 1ª até 30 km/h, 2ª até 60 km/h, 3ª até 90 km/h e 4ª até 125 km/h. Fome, sede e desgaste afetam a aceleração, sem reduzir o limite indicado da marcha. R sobe a marcha e Q reduz; também é possível clicar nos botões do painel à direita. Marchas mais altas aceleram mais devagar. Reduzir aplica freio-motor gradualmente; S continua freando e permite a ré. A perseguição usa o mesmo câmbio e a mesma unidade de velocidade.

Ao montar, gasolina, fome e sede sobem para liberar espaço para o painel, que mostra velocidade digital, faixa de RPM, marcha e limite em um painel compacto. Ao descer, os indicadores voltam à posição anterior.
## Ignição e chaveiro
A partida começa a pé, ao lado da moto desligada. O minigame aparece ao montar com o motor desligado; descer e subir com o motor ligado não o repete. Com a moto parada e o personagem montado, F desliga o motor ou abre a ignição para ligar novamente. Para dar a partida, arraste a chave pelo cabo e solte o botão esquerdo sobre a fechadura centralizada para encaixar. Depois, gire para a direita para ligar o motor. Após encaixar com o mouse, Enter também permite girar a chave; Esc cancela mantendo o personagem montado. A chance de falhar aumenta linearmente de 35% (moto íntegra) até 85% (condição mínima). A condição de partida combina 70% do estado do motor e 30% da integridade geral da moto; reparos reduzem a chance já na próxima tentativa. Quando a partida falha: a luz fica vermelha e a chave retorna para tentar novamente, sem precisar encaixá-la outra vez. Depois de cinco falhas seguidas, a próxima tentativa liga; fechar a ignição não reinicia essa contagem. Combustível e estado da moto continuam necessários. O escape emite fumaça suave enquanto o motor funciona, mais intensa em rotações altas; ao desligar, a fumaça restante se dissipa. A ignição e a oficina aparecem em painéis compactos; o mundo, a fome, a sede e o desgaste continuam em tempo real. A pé, F abre a oficina. Na visão geral da oficina, WASD continua movimentando o personagem; afastar-se da moto fecha o painel. O chaveiro tem desenhos de Yuuri, Chito e Nuko, de Girls' Last Tour.
Verificação: node tests/ignition.test.js.

## Sobrevivente e moto em 128 direções
O personagem tem aparência andrógina, cabelo prateado curto, capacete escuro, máscara e uniforme angular, sem lenço vermelho. Roupa remendada, mochila costurada, botas reparadas e equipamento gasto mostram os efeitos da sobrevivência solitária. A caminhada usa 64 quadros completos: oito passos em oito direções, com braços e mochila acompanhando o movimento. Parado e na moto, são usadas 16 poses estáveis, mantendo a escala e a posição recuada no banco. A prévia animada fica em `assets/sprites-128/andar-preview.html`; detalhes e prompts em `assets/sprites-128/README.md` e `prompts.json`.

O jogo abre dentro da página. As poses, máscaras do farol e sombras são reutilizadas; os prédios compartilham a geometria projetada entre sombra e desenho. Arquivos antigos, capturas sem uso e a pasta interna vazia foram removidos.

Verificações: `node tests/sprites-128.test.js`, `node tests/render-cache.test.js`, `node tests/bike-maintenance.test.js`, `node tests/ignition.test.js` e `node tests/display.test.js`. O teste `node tests/animation-browser.test.js` usa Chrome ou Edge instalado para conferir a renderização e gerar uma prévia, sem instalar dependências.

## Furo no motor e vazamento
O serviço Vedar furo do motor substitui a desobstrução do circuito. Segure o botão esquerdo sobre cada um dos quatro pontos do furo para aplicar selante; sair do ponto pausa o trabalho. Pelo teclado, 1–4 seleciona o ponto e E aplica pequenas doses. Furos maiores aparecem maiores e exigem mais tempo de vedação. O dano desse defeito determina o vazamento: há uma margem de 5% para desgaste leve; a perda cresce com o quadrado da gravidade e chega a 21 pontos percentuais de gasolina por minuto. O vazamento continua com o motor desligado e durante exploração ou reparos. Só concluir o serviço restaura esse defeito e estanca a perda; cancelar preserva o dano e o kit. O painel do reparo mostra o tamanho e a taxa de perda. A moto continua iniciando com 20% de condição para testes.
