# Jogo-Foda
Um jogo que deve rodar no navegador

## Manutenção da moto

Desmonte da moto, aproxime-se e pressione F. As abas Motor, Pneus e Guidão mantêm os diagnósticos existentes. Clique em um serviço para reparar.

- Reparos: ignição por sincronização, folga de válvulas, circuito de óleo, mistura, remendos com secagem da cola, calibragem, fixações, limpeza com escova (clique ou arraste), alinhamento, cabos, torque e rolamentos.
- Controles: clique nos componentes, 1–4 para pontos de trabalho, 5–8 para conectores, setas ou −/+ para ajustes e E para confirmar. Esc cancela.
- Um reparo concluído consome um kit existente. Treinos em peças e moto íntegras não consomem kits. Falhas e cancelamentos não alteram a peça nem gastam recursos.

Verificação da lógica: `node tests/bike-maintenance.test.js`.
Os reparos também aceitam gestos com o mouse: gire a chave ao redor da fixação, mova a bomba para baixo e para cima, esfregue a lixa e a escova, arraste cabos até os conectores e mantenha o remendo pressionado por 0,8 segundo depois de a cola secar. Arraste a lâmina e o guidão para ajustar folga e alinhamento. O cursor mostra uma mão com a ferramenta da etapa atual e volta ao normal ao terminar, cancelar ou fechar a inspeção.
A moto sofre desgaste gradual enquanto o tempo de jogo passa: cerca de 1–3 pontos percentuais por dez minutos rodando, conforme a peça e a velocidade, e desgaste mínimo quando estacionada. A inspeção interrompe esse desgaste. Colisões danificam um único defeito de uma peça aleatória, com perda leve proporcional à velocidade do impacto. Contatos muito leves não causam dano; há 1,5 segundo de intervalo entre impactos. O aviso identifica a peça e os reparos existentes restauram o defeito afetado. Esse dano também se aplica aos obstáculos das perseguições.
## Câmbio e painel

A moto possui quatro marchas manuais: 1ª até 25 km/h, 2ª até 60 km/h, 3ª até 90 km/h e 4ª até 125 km/h. Fome, sede e desgaste afetam a aceleração, sem reduzir o limite indicado da marcha. R sobe a marcha e Q reduz; também é possível clicar nos botões do painel à direita. Marchas mais altas aceleram mais devagar. Reduzir aplica freio-motor gradualmente; S continua freando e permite a ré. A perseguição usa o mesmo câmbio e a mesma unidade de velocidade.

Ao montar, gasolina, fome e sede sobem para liberar espaço para o painel, que mostra velocidade digital, faixa de RPM, marcha e limite em um painel compacto. Ao descer, os indicadores voltam à posição anterior.