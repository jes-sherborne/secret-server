#!/usr/bin/env bash

get_org_name (){
  while [ -z "$org_name" ]; do
    read -p "What is the full name of your company or organization (e.g., ACME Products, Inc.)? " org_name
  done
}

get_sans(){
  san_dns_n=0
  san_ip_n=0
  san_dns=
  san_ip=
  echo "List all the DNS names that are used for this server (including the name you entered above, if applicable). Enter names one at a time. Enter a blank when finished."

  while true; do
    read -p "DNS name: " san_value
    if [ -z "$san_value" ]; then
      break
    fi
    san_dns[san_dns_n]="$san_value"
    ((san_dns_n++))
  done

  echo "List all the IP addresses that will be used directly by clients to connect to this server. Enter IPs one at a time. Enter a blank when finished."
  while true; do
    read -p "IP address: " san_value
    if [ -z "$san_value" ]; then
      break
    fi
    san_ip[san_ip_n]="$san_value"
    ((san_ip_n++))
  done

  if [ $((san_dns_n + san_ip_n)) -eq 0 ]; then
    echo "You need to enter at least one DNS name or IP address, or the certificate won't be usable"
    get_sans
  fi
}

get_localhost_sans () {
  lower_host="$(hostname)"
  lower_host=$(echo "$(hostname)" | tr '[:upper:]' '[:lower:]')
  san_dns_n=2
  san_ip_n=2
  san_dns=("$lower_host" "localhost")
  san_ip=("127.0.0.1")
}

get_new_signing_ca_info () {

  signing_ca_name=
  signing_ca_dir=
  if [ ! -z "$1" ]; then
    signing_ca_name="$1"
  fi

  while [ -z "$signing_ca_name" ]; do
    read -p "What do you want to call your signing CA? Unless you need to run multiple signing CAs at a time (you probably don't), just call it '1', '2', etc: " signing_ca_name
  done
  signing_ca_dir="signing-ca-$signing_ca_name"
  if [ -d "$signing_ca_dir" ]; then
    echo "You already have a signing CA with this name."
    signing_ca_name=
    signing_ca_dir=
    get_new_signing_ca_info
  fi
}

get_existing_signing_ca_dir () {
  if [ -z "$signing_ca_dir" ]; then
    signing_ca_dirs=()
    while IFS= read -d $'\0' -r file ; do
      signing_ca_dirs=("${signing_ca_dirs[@]}" "$file")
    done < <(find . -type d -maxdepth 1 -name 'signing-ca-*' -print0 | sort -z)

    if [ ${#signing_ca_dirs[@]} -eq 1 ]; then
      signing_ca_dir=${signing_ca_dirs[0]}
      signing_ca_dir=${signing_ca_dir##*/}
    elif [ ${#signing_ca_dirs[@]} -gt 0 ]; then
      PS3="Which of the signing CAs do you want to use? "
      select signing_ca_dir in "${signing_ca_dirs[@]##*/}"; do
        if [ ! -z "$signing_ca_dir" ]; then
          break;
         fi
      done
    else
      echo "This command isn't available because there are no signing CAs"
      exit 0
    fi
  fi
}

get_signing_ca_password () {
  while [ -z "$signing_ca_password" ]; do
    read -p "Enter the password for $signing_ca_dir: " -s signing_ca_password
    printf "\n"
  done
}

get_root_ca_password () {
  while [ -z "$root_ca_password" ]; do
    read -p "Enter the root CA password: " -s root_ca_password
    printf "\n"
  done
}

get_server_name (){
  server_name=
  if [ ! -z "$1" ]; then
    server_name=$(echo "$1" | tr '[:upper:]' '[:lower:]')
  fi

  while [ -z "$server_name" ]; do
  read -p "What is the most common DNS name of the server (e.g., 'secret.example.com')? " server_name
  done
  server_file_name="$server_name"
  if [ -e "$signing_ca_dir/certs/$server_file_name.cert.pem" ]; then
    server_file_counter=2
    while true; do
      server_file_name="$server_name-$server_file_counter"
      if [ ! -e "$signing_ca_dir/certs/$server_file_name.cert.pem" ]; then
        break
      fi
      ((server_file_counter++))
    done
  fi

}

get_client_name (){
  client_prompt="the user's"
  if [ ! -z "$1" ]; then
    client_prompt="$1"
  fi

  client_email=""
  client_name=""
  while [ -z "$client_email" ]; do
    read -p "What is $client_prompt email address (e.g., 'user@example.com')? " client_email
  done
  while [ -z "$client_name" ]; do
    read -p "What is $client_prompt full name (e.g., 'John Smith')? " client_name
  done
  client_file_name="$client_email"
  if [ -e "$signing_ca_dir/certs/$client_file_name.cert.pem" ]; then
    client_file_counter=2
    while true; do
      client_file_name="$client_email-$client_file_counter"
      if [ ! -e "$signing_ca_dir/certs/$client_file_name.cert.pem" ]; then
        break
      fi
      ((client_file_counter++))
    done
  fi

}

init_ca_directory (){
  if [ -d "$1" ]; then
    rm -rf "$1"
  fi
  mkdir "$1"
  mkdir "$1/certs"
  mkdir "$1/crl"
  mkdir "$1/csr"
  mkdir "$1/newcerts"
  mkdir "$1/private"
  mkdir "$1/db"
  chmod 700 "$1/private"
  touch "$1/db/index.txt"
  touch "$1/db/index.txt.attr"
  echo 1000 > "$1/db/serial"
  echo 1000 > "$1/db/crlnumber"
}

create_root_ca () {
  init_ca_directory "$root_ca_dir"

  root_ca_dir_rel="./$root_ca_dir"

  temp_conf=$(<"$script_dir/root-ca.conf")
  temp_conf="${temp_conf//____orgName____/$org_name}"
  temp_conf="${temp_conf//____dir____/$root_ca_dir_rel}"
  echo "$temp_conf" > "$root_ca_dir/root-ca.conf"

  root_ca_password="$(openssl rand -base64 33)"

  # We generate a new key file, protect it with a strong password, create a root certificate, and self-sign it

  # piping in the password seems to have the best security characteristics of the available options
  # https://stackoverflow.com/questions/6321353/securely-passing-password-to-openssl-via-stdin

  openssl genrsa -aes256 -out "$root_ca_dir/private/root-ca.key.pem" -passout file:<( printf "$root_ca_password" ) 4096
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 400 "$root_ca_dir/private/root-ca.key.pem"

  openssl req -config "$root_ca_dir/root-ca.conf" -key "$root_ca_dir/private/root-ca.key.pem" -passin file:<( printf "$root_ca_password" ) -new -x509 -days 7305 -sha256 -extensions root_ca_ext -out "$root_ca_dir/certs/root-ca.cert.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$root_ca_dir/certs/root-ca.cert.pem"
}

create_signing_ca () {
  init_ca_directory "$signing_ca_dir"

  signing_ca_dir_rel="./$signing_ca_dir"

  temp_conf=$(<"$script_dir/signing-ca.conf")
  temp_conf="${temp_conf//____orgName____/$org_name}"
  temp_conf="${temp_conf//____dir____/$signing_ca_dir_rel}"
  temp_conf="${temp_conf//____caName____/$signing_ca_name}"
  echo "$temp_conf" > "$signing_ca_dir/ca.conf"

  signing_ca_password="$(openssl rand -base64 33)"

  # We generate a new key file and protect it with a strong password
  openssl genrsa -aes256 -out "$signing_ca_dir/private/ca.key.pem" -passout file:<( printf "$signing_ca_password" ) 4096
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 400 "$signing_ca_dir/private/ca.key.pem"

  # Create a csr
  openssl req -config "$signing_ca_dir/ca.conf" -new -sha256 -key "$signing_ca_dir/private/ca.key.pem" -passin file:<( printf "$signing_ca_password" ) -out "$signing_ca_dir/certs/ca.csr.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi

  # Have the root-ca sign to generate a cert
  openssl ca -config "$root_ca_dir/root-ca.conf" -extensions signing_ca_ext -notext -batch -passin file:<( printf "$root_ca_password" ) -in "$signing_ca_dir/certs/ca.csr.pem" -out "$signing_ca_dir/certs/ca.cert.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$signing_ca_dir/certs/ca.cert.pem"

  # Create the certificate chain
  cat "$signing_ca_dir/certs/ca.cert.pem" "$root_ca_dir/certs/root-ca.cert.pem" > "$signing_ca_dir/certs/ca-chain.cert.pem"
  chmod 444 "$signing_ca_dir/certs/ca-chain.cert.pem"
}

create_server_cert () {

  temp_conf=$(<"$script_dir/server-req.conf")
  temp_conf="${temp_conf//____orgName____/$org_name}"
  temp_conf="${temp_conf//____commonName____/$server_name}"
  echo "$temp_conf" > "$signing_ca_dir/csr/$server_file_name.req.conf"

  i_san=0
  san_value=
  for san_value in "${san_dns[@]}"
  do
    if [ ! -z "$san_value" ]; then
      ((i_san++))
      printf "DNS.$i_san = $san_value \n" >> "$signing_ca_dir/csr/$server_file_name.req.conf"
    fi
  done

  i_san=0
  san_value=
  for san_value in "${san_ip[@]}"
  do
    if [ ! -z "$san_value" ]; then
      ((i_san++))
      printf "IP.$i_san = $san_value \n" >> "$signing_ca_dir/csr/$server_file_name.req.conf"
    fi
  done

  openssl genrsa -out "$signing_ca_dir/private/$server_file_name.key.pem" 2048
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 400 "$signing_ca_dir/private/$server_file_name.key.pem"

  openssl req -config "$signing_ca_dir/csr/$server_file_name.req.conf" -key "$signing_ca_dir/private/$server_file_name.key.pem" -new -sha256 -out "$signing_ca_dir/csr/$server_file_name.csr.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$signing_ca_dir/csr/$server_file_name.csr.pem"

  openssl ca -config "$signing_ca_dir/ca.conf" -extensions server_ext -policy policy_server -notext -batch -passin file:<( printf "$signing_ca_password" ) -in "$signing_ca_dir/csr/$server_file_name.csr.pem" -out "$signing_ca_dir/certs/$server_file_name.cert.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$signing_ca_dir/certs/$server_file_name.cert.pem"
}

create_client_cert () {

  temp_conf=$(<"$script_dir/client-req.conf")
  temp_conf="${temp_conf//____orgName____/$org_name}"
  temp_conf="${temp_conf//____commonName____/$client_name}"
  temp_conf="${temp_conf//____emailAddress____/$client_email}"
  echo "$temp_conf" > "$signing_ca_dir/csr/$client_file_name.req.conf"

  openssl genrsa -out "$signing_ca_dir/private/$client_file_name.key.pem" 2048
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 400 "$signing_ca_dir/private/$client_file_name.key.pem"

  openssl req -config "$signing_ca_dir/csr/$client_file_name.req.conf" -key "$signing_ca_dir/private/$client_file_name.key.pem" -new -sha256 -out "$signing_ca_dir/csr/$client_file_name.csr.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$signing_ca_dir/csr/$client_file_name.csr.pem"

  openssl ca -config "$signing_ca_dir/ca.conf" -extensions client_ext -policy policy_client -notext -batch -passin file:<( printf "$signing_ca_password" ) -in "$signing_ca_dir/csr/$client_file_name.csr.pem" -out "$signing_ca_dir/certs/$client_file_name.cert.pem"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi
  chmod 444 "$signing_ca_dir/certs/$client_file_name.cert.pem"

  client_pfx_password="$(openssl rand -base64 33)"
  openssl pkcs12 -keypbe PBE-SHA1-3DES -certpbe PBE-SHA1-3DES -export -in "$signing_ca_dir/certs/$client_file_name.cert.pem" -inkey "$signing_ca_dir/private/$client_file_name.key.pem" -certfile "$signing_ca_dir/certs/ca.cert.pem" -out "$signing_ca_dir/private/$client_file_name.pfx"  -passout file:<( printf "$client_pfx_password" ) -name "$client_name Certificate"
  if [ ! $? -eq 0 ]; then
    echo "Encountered error and could not continue"
    exit 1
  fi

}

action_top_menu_new () {
  printf "It looks like you haven't run cert-helper in this directory before, so it will set up everything for you.\n\n"
  top_actions=("Create files for local testing" "Create files for a production system" "Quit")
  PS3="What would you like to do (1-${#top_actions[@]})? "
  select top_action in "${top_actions[@]}"
  do
    case "$top_action" in
    "Create files for local testing")
      get_org_name
      get_new_signing_ca_info "1"
      get_server_name $(hostname)
      get_localhost_sans
      get_client_name "your"
      break
      ;;
    "Create files for a production system")
      get_org_name
      get_new_signing_ca_info
      get_server_name
      get_sans
      get_client_name "your"
      break
      ;;
    "Quit")
      exit 0
      ;;
    esac
  done

  create_root_ca
  create_signing_ca
  create_server_cert
  create_client_cert

  printf "org_name=\"$org_name\"" > "./cert-helper-config"

  printf "\n\n"
  printf "******************************************************************************\n"
  printf "OUTPUT SUMMARY\n\n"

  printf "Top-level directory for certificate files is $top_level_dir\n\n"

  printf "Store these passwords in a secure location, like a password manager:\n\n"
  printf "1.  Root CA password (used to create new signing CAs): $root_ca_password\n"
  printf "2.  Signing CA password (used to create new client and server certificates): $signing_ca_password\n"
  printf "3.  PKCS12 bundle password (used to install your user certificate): $client_pfx_password\n"

  printf "\nHere is your root certificate. Install this on any computers that you want to automatically trust the certificates you create:\n\n"
  printf "1.  Root certificate $root_ca_dir/certs/root-ca.cert.pem\n"

  printf "\nHere are your server certificate files. You will need all of them to run a secure server. Note that the key file is secret, so protect it carefully:\n\n"

  printf "1.  Signing CA certificate chain: $signing_ca_dir/certs/ca-chain.cert.pem\n"
  printf "2.  Server certificate for $server_name: $signing_ca_dir/certs/$server_file_name.cert.pem\n"
  printf "3.  Server secret key for $server_name: $signing_ca_dir/private/$server_file_name.key.pem\n"


  printf "\nHere are your personal certificate files. You will need to install them on your system to connect to systems that require client certificates (like Secret Server). On Mac and Windows, you will just need the pfx file and its password (see above):\n\n"

  printf "1.  Client certificate for $client_email: $signing_ca_dir/certs/$client_file_name.cert.pem\n"
  printf "2.  Client secret key for $client_email: $signing_ca_dir/private/$client_file_name.key.pem\n"
  printf "3.  Client key PKCS12 bundle: $signing_ca_dir/private/$client_file_name.pfx\n"
  printf "\n******************************************************************************\n"
}

action_top_menu () {
  top_actions=("New client" "New server" "New signing CA" "Quit")
  PS3="What would you like to do (1-${#top_actions[@]})? "
  select top_action in "${top_actions[@]}"
  do
    case "$top_action" in
    "New client")
      get_org_name
      get_existing_signing_ca_dir
      get_signing_ca_password
      get_client_name
      create_client_cert

      printf "\n\n"
      printf "******************************************************************************\n"
      printf "OUTPUT SUMMARY\n\n"

      printf "1.  Client certificate for $client_email: $top_level_dir/$signing_ca_dir/certs/$client_file_name.cert.pem\n"
      printf "2.  Client key for $client_email: $top_level_dir/$signing_ca_dir/private/$client_file_name.key.pem\n"
      printf "3.  Client key PKCS12 bundle: $top_level_dir/$signing_ca_dir/private/$client_file_name.pfx\n"
      printf "4.  Password for PKCS12 bundle: $client_pfx_password\n"
      printf "\n******************************************************************************\n"
      break
      ;;
    "New server")
      get_org_name
      get_existing_signing_ca_dir
      get_signing_ca_password
      get_server_name
      get_sans
      create_server_cert

      printf "\n\n"
      printf "******************************************************************************\n"
      printf "OUTPUT SUMMARY\n\n"
      printf "Store this information for future reference\n\n"

      printf "1.  Server certificate for $server_name: $top_level_dir/$signing_ca_dir/certs/$server_file_name.cert.pem\n"
      printf "2.  Server key for $server_name: $top_level_dir/$signing_ca_dir/private/$server_file_name.key.pem\n"
      printf "3.  Signing CA certificate chain (already existing): $top_level_dir/$signing_ca_dir/certs/ca-chain.cert.pem\n"
      printf "\n******************************************************************************\n"
      break
      ;;
    "New signing CA")
      get_org_name
      get_root_ca_password
      get_new_signing_ca_info
      create_signing_ca

      printf "\n\n"
      printf "******************************************************************************\n"
      printf "OUTPUT SUMMARY\n\n"
      printf "Store this information for future reference\n\n"

      printf "1.  Signing CA password (keep secret): $signing_ca_password\n"
      printf "2.  Signing CA certificate chain: $top_level_dir/$signing_ca_dir/certs/ca-chain.cert.pem\n"
      printf "\n******************************************************************************\n"
      break
      ;;
    "Quit")
      exit 0
      ;;
    esac
  done
  printf "\n\n"
  action_top_menu
}

#*************************************************************************************************
#*************************************************************************************************
#*************************************************************************************************
# Script starts here
#*************************************************************************************************
#*************************************************************************************************
#*************************************************************************************************

if [ -z "$1" ]; then
  printf "You need to specify a path\n"
fi

pushd "$( dirname "${BASH_SOURCE[0]}" )"
script_dir="$(pwd)"
popd

cd "$1"
if [ ! $? -eq 0 ]; then
  exit 1
fi
top_level_dir="$(pwd)"

if [ -e "./cert-helper-config" ]; then
  source "./cert-helper-config"
  has_config=1
else
  has_config=0
fi

root_ca_dir="root-ca"

printf "******************************************************************************\n"
printf "* cert-helper\n"
printf "******************************************************************************\n\n"

if [ "$has_config" -eq 0 ]; then
  action_top_menu_new
else
  action_top_menu
fi
