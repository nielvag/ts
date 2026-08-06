
import json

def processar_arquivo_json(caminho_entrada, caminho_saida):
    # Tenta abrir e carregar o arquivo JSON
    try:
        with open(caminho_entrada, 'r', encoding='utf-8') as f:
            dados = json.load(f)
    except FileNotFoundError:
        print(f"Erro: O arquivo '{caminho_entrada}' não foi encontrado.")
        return
    except json.JSONDecodeError:
        print(f"Erro: O arquivo '{caminho_entrada}' não é um JSON válido.")
        return

    # Processa cada objeto dentro da lista principal
    for index, objeto in enumerate(dados):
        id_texto = objeto.get('id_texto', f'Índice {index}')
        
        # Verifica se a chave 'resposta_json' existe no objeto
        if 'resposta_json' in objeto:
            resposta = objeto['resposta_json']
            
            # Verifica se o conteúdo é realmente uma lista
            if isinstance(resposta, list):
                # Verifica se a lista tem exatamente um único elemento
                if len(resposta) == 1:
                    # Cria a nova chave com o objeto (tirando da lista)
                    objeto['categoria_conteudo'] = resposta[0]
                    # Remove a chave antiga
                    del objeto['resposta_json']
                else:
                    print(f"⚠️ Aviso (ID: {id_texto}): 'resposta_json' possui {len(resposta)} elementos. Esperava-se apenas 1. O item não foi modificado.")
            else:
                print(f"⚠️ Aviso (ID: {id_texto}): 'resposta_json' não é um array/lista. O item não foi modificado.")
        else:
            print(f"⚠️ Aviso (ID: {id_texto}): A chave 'resposta_json' não foi encontrada neste objeto.")

    # Tenta salvar os dados modificados em um novo arquivo
    try:
        with open(caminho_saida, 'w', encoding='utf-8') as f:
            # ensure_ascii=False preserva acentos, indent=2 deixa formatado bonito
            json.dump(dados, f, ensure_ascii=False, indent=2)
        print(f"✅ Processamento concluído! Arquivo salvo como '{caminho_saida}'.")
    except Exception as e:
        print(f"Erro ao salvar o arquivo: {e}")

# --- Como usar ---
# Coloque o nome do seu arquivo original no primeiro parâmetro
# e o nome do arquivo que será gerado no segundo parâmetro.

arquivo_original = './jornalistas-influenciadores/resultados/Guga-Noblat-conteudo.json'
arquivo_novo = './jornalistas-influenciadores/resultados/Guga-Noblat-conteudo2.json'

processar_arquivo_json(arquivo_original, arquivo_novo)