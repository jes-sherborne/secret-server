# Configuring AWS for secret-server

Secret-server has been specifically designed to take advantage of AWS's security features. This document explains how to
configure AWS to provide a secure and high-performing instance.

You should run all components of secret-server in the same AWS region (e.g., us-west-2).

## Create S3 bucket

You will create an S3 bucket to hold your secret-server data. If you run multiple instances of secret-server, you must
create a separate bucket for each instance.

In the Amazon AWS console:
1. Go to S3
2. Click _Create Bucket_
3. Choose a memorable name for your bucket, like _secret-server_.
4. Choose your preferred region
5. Click _next_
6. Set properties if you want. Secret-server does not require any changes to these, but feel free to add tags or logging.
7. Click _next_
8. Remove all access privileges. You will enable access to this bucket later via a role
9. Click _next_
10. Review your settings and click _Create Bucket_.
11. Take note of the __arn__. You will need it later.

## Create KMS key

Amazon KMS provides very secure storage and management of encryption keys, and secret-server can be configured to use
this capability.

You should create a KMS key for each instance of secret-server.

In the Amazon AWS console:
1. Go to IAM
2. Click Encryption Keys
3. Choose the same region you selected for S3
4. Click _Create Key_
5. Give it a memorable name. It's convenient to give it the same name as your S3 bucket. Click _Next_.
6. Add tags if you wish. Click _Next_.
7. Leave Key Administrators empty. Click _Next_.
8. Leave Key Usage permissions empty. Click _Next_.
9. Click _Finish_
10. Take note of the arn. You will need it later.


## Create IAM role

Secret-server requires very few permissions to run, and we will create a very restricted custom role for it to use.

### Create the core role

In the Amazon AWS console:
1. Go to IAM
2. Choose _Roles_
3. Click _Create role_
4. Choose _AWS Service_ + _EC2_ + use case _EC2_. Click _Next: Permissions_
5. Skip all permissions. Click _Next: Review_
6. Give your role a name. It's convenient to give it the same name as your S3 bucket and key.
7. Click _Create role_
8. Click the role you just created.

### Add access to KMS

1. Click _Add inline policy_
2. Select _Policy Generator_
3. For AWS Service, select _AWS Key Management Service_
4. For Actions, choose _Decrypt_ and _Generate Data Key_
5. For ARN, enter the arn of the key you created above
6. Click _Add statement_
7. Click _Next step_
8. Give your policy a meaningful name, like _kms-secret-server-timestamp_. The policy should look like

    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "Stmt1509072605000",
                "Effect": "Allow",
                "Action": [
                    "kms:Decrypt",
                    "kms:GenerateDataKey"
                ],
                "Resource": [
                    "arn:aws:kms:us-west-2:000000000000:key/00000000-0000-0000-0000-000000000000"
                ]
            }
        ]
    }
    ```
9. Click _Apply Policy_

### Add access to S3

1. Click _Add inline policy_
2. Select _Policy Generator_
3. For AWS Service, select _Amazon S3_
4. For Actions, choose _ListBucket_
5. For ARN, enter the arn of the bucket you created above
6. Click _Add statement_
7. For Actions, choose _GetObject_ and _PutObject_
8. For ARN, enter the arn of the bucket you created above __followed by /*__
9. Click _Add statement_
10. Click _Next step_
11. Give your policy a meaningful name, like _s3-secret-server-timestamp_. The policy should look like

    ```json
    {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Sid": "Stmt1508556505000",
                "Effect": "Allow",
                "Action": [
                    "s3:ListBucket"
                ],
                "Resource": [
                    "arn:aws:s3:::secret-server"
                ]
            },
            {
                "Sid": "Stmt1508556878000",
                "Effect": "Allow",
                "Action": [
                    "s3:GetObject",
                    "s3:PutObject"
                ],
                "Resource": [
                    "arn:aws:s3:::secret-server/*"
                ]
            }
        ]
    }    
    ```
12. Click _Apply Policy_


## Create EC2 instance

You will run Secret-Server on an EC2 instance. Secret-Server is efficient and provides good 
performance even on modest hardware. For most organizations, a T2.micro instance will be more than sufficient.

In the Amazon AWS console:
1. Go to EC2
2. Click _Launch Instance_
3. Choose Ubuntu Server 16.04 (or whatever distribution suits you)
4. Select the t2.micro instance type. 
5. Click _Next: Configure instance details_
6. Choose a subnet in your preferred region
7. Choose the IAM policy you created above
8. Click _Next: Add storage_
9. Leave the default values as is, since secret-server requires minimal local storage. Click _Next: Add tags_
10. Add any tags you like. Click _Next: Configure Security Group_
11. Limit the valid ports for SSH, if you like.
12. Add two custom TCP rules. One for port 1800 and one for port 1880. Choose which IPs or security groups can access these ports.
    
    __A note on the ports__
    
    Secret-server splits its access into two parts. The administrative interface runs on port 1880. You connect to 
    this port in a web browser to add users, add secrets, and manage permissions. There is no way to access secrets
    via this interface.
    
    Secret access is via port 1800. This interface allows you to list and access the specific secrets for the user,
    but there is no administrative capability.
    
    By splitting access this way, you can use a security group to provide administrative access via the internet but 
    restrict the secrets to just an internal security group. This makes it convenient to administer secret-server without
    exposing your secrets.
13. Give the security group a sensible name. It's convenient to give it the same name as your S3 bucket and key.
14. Click _Review and Launch_

When the instance has launched, you can install secret-server by following the directions in the 
[installation guide for Ubuntu](ubuntu-installation-guide.md).